#!/usr/bin/env bash
# CMP Mail Platform - Add Domain Script
set -euo pipefail

CMP_HOME="/opt/cmp"
source "${CMP_HOME}/.env" 2>/dev/null || true

DB_NAME="${DB_NAME:-cmp}"
DB_USER="${DB_USER:-cmp}"
DB_HOST="${DB_HOST:-127.0.0.1}"

log()   { echo "[CMP] $*"; }
error() { echo "[CMP ERROR] $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || error "Must run as root"

DOMAIN="${1:-}"
[[ -n "$DOMAIN" ]] || error "Usage: $0 <domain> [--skip-verify]"

SKIP_VERIFY=false
[[ "${2:-}" == "--skip-verify" ]] && SKIP_VERIFY=true

# Validate domain format
if ! echo "$DOMAIN" | grep -qP '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$'; then
    error "Invalid domain format: $DOMAIN"
fi

# Check if domain already exists
EXISTS=$(sudo -u postgres psql -t -c "SELECT count(*) FROM mail_domains WHERE domain_name='${DB_NAME}'" 2>/dev/null | tr -d ' ' || echo "0")
if [[ "$EXISTS" != "0" ]]; then
    error "Domain $DOMAIN already exists in database"
fi

# Generate DKIM key
log "Generating DKIM key for $DOMAIN..."
SELECTOR="cmp"
DKIM_DIR="/var/lib/rspamd/dkim"
mkdir -p "$DKIM_DIR"

if command -v rspamadm &>/dev/null; then
    rspamadm dkim_keygen -s "$SELECTOR" -d "$DOMAIN" -b 2048 -k "${DKIM_DIR}/${DOMAIN}.${SELECTOR}.key" > "${DKIM_DIR}/${DOMAIN}.${SELECTOR}.txt" 2>/dev/null
else
    openssl genrsa -out "${DKIM_DIR}/${DOMAIN}.${SELECTOR}.key" 2048 2>/dev/null
    openssl rsa -in "${DKIM_DIR}/${DOMAIN}.${SELECTOR}.key" -pubout -outform PEM 2>/dev/null | \
        grep -v '^-' | tr -d '\n' > /tmp/dkim_pub_${DOMAIN}
    echo "v=DKIM1; k=rsa; p=$(cat /tmp/dkim_pub_${DOMAIN})" > "${DKIM_DIR}/${DOMAIN}.${SELECTOR}.txt"
    rm -f /tmp/dkim_pub_${DOMAIN}
fi

chmod 600 "${DKIM_DIR}/${DOMAIN}.${SELECTOR}.key"
chmod 644 "${DKIM_DIR}/${DOMAIN}.${SELECTOR}.txt"
chown -R _rspamd:_rspamd "$DKIM_DIR"

# Extract public key for DNS
DKIM_RECORD=$(cat "${DKIM_DIR}/${DOMAIN}.${SELECTOR}.txt")

# Add domain to database
log "Adding domain to database..."
sudo -u postgres psql -d "$DB_NAME" -c "INSERT INTO mail_domains (domain_name, is_active) VALUES ('$DOMAIN', true);" 2>/dev/null || \
    PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO mail_domains (domain_name, is_active) VALUES ('$DOMAIN', true);" 2>/dev/null || \
    error "Failed to add domain to database"

# Update OpenDKIM config
if [[ -f /etc/opendkim/KeyTable ]]; then
    if ! grep -q "$DOMAIN" /etc/opendkim/KeyTable; then
        echo "${SELECTOR}._domainkey.${DOMAIN} ${DOMAIN}:${SELECTOR}:/var/lib/rspamd/dkim/${DOMAIN}.${SELECTOR}.key" >> /etc/opendkim/KeyTable
        echo "*@${DOMAIN} ${SELECTOR}._domainkey.${DOMAIN}" >> /etc/opendkim/SigningTable
    fi
fi

# Update Rspamd DKIM signing config
if [[ -f /etc/rspamd/local.d/dkim_signing.conf ]]; then
    if ! grep -q "$DOMAIN" /etc/rspamd/local.d/dkim_signing.conf; then
        cat >> /etc/rspamd/local.d/dkim_signing.conf <<DKIMCONF

domain {
    ${DOMAIN} {
        selector = "${SELECTOR}";
        path = "/var/lib/rspamd/dkim/${DOMAIN}.${SELECTOR}.key";
    }
}
DKIMCONF
    fi
fi

# Restart services
log "Restarting services..."
systemctl restart rspamd opendkim 2>/dev/null || true

# Display DNS records
echo ""
echo "=========================================="
echo "  Domain Added: $DOMAIN"
echo "=========================================="
echo ""
echo "  Required DNS records:"
echo ""
echo "  1. MX Record:"
echo "     Name:  $DOMAIN"
echo "     Value: mail.cmp.local"
echo "     Priority: 10"
echo ""
echo "  2. SPF Record (TXT):"
echo "     Name:  $DOMAIN"
echo "     Value: v=spf1 mx a ip4:$(hostname -I | awk '{print $1}') -all"
echo ""
echo "  3. DKIM Record (TXT):"
echo "     Name:  ${SELECTOR}._domainkey.${DOMAIN}"
echo "     Value: ${DKIM_RECORD}"
echo ""
echo "  4. DMARC Record (TXT):"
echo "     Name:  _dmarc.${DOMAIN}"
echo "     Value: v=DMARC1; p=quarantine; rua=mailto:postmaster@${DOMAIN}"
echo ""
echo "=========================================="
echo ""
echo "  DKIM private key: ${DKIM_DIR}/${DOMAIN}.${SELECTOR}.key"
echo "  DKIM public key:  ${DKIM_DIR}/${DOMAIN}.${SELECTOR}.txt"
echo ""
echo "  After adding DNS records, verify with:"
echo "    dig MX $DOMAIN +short"
echo "    dig TXT ${SELECTOR}._domainkey.${DOMAIN} +short"
echo "    dig TXT $DOMAIN +short"
echo "=========================================="
