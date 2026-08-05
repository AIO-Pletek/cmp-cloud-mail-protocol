#!/usr/bin/env bash
# CMP Mail Platform - Generate DKIM Keys Script
set -euo pipefail

DKIM_DIR="/var/lib/rspamd/dkim"
SELECTOR="${2:-cmp}"
KEY_SIZE="${3:-2048}"

log()   { echo "[CMP-DKIM] $*"; }
error() { echo "[CMP-DKIM ERROR] $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || error "Must run as root"

DOMAIN="${1:-}"
[[ -n "$DOMAIN" ]] || {
    echo "Usage: $0 <domain> [selector] [key-size]"
    echo ""
    echo "Examples:"
    echo "  $0 example.com"
    echo "  $0 example.com cmp 2048"
    echo "  $0 example.com mail 4096"
    exit 1
}

# Validate domain
if ! echo "$DOMAIN" | grep -qP '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$'; then
    error "Invalid domain format: $DOMAIN"
fi

KEY_FILE="${DKIM_DIR}/${DOMAIN}.${SELECTOR}.key"
PUB_FILE="${DKIM_DIR}/${DOMAIN}.${SELECTOR}.txt"

# Check if key already exists
if [[ -f "$KEY_FILE" ]]; then
    echo ""
    echo "WARNING: DKIM key already exists for ${DOMAIN} (selector: ${SELECTOR})"
    echo "  Key: $KEY_FILE"
    echo ""
    read -rp "Overwrite? [y/N]: " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

mkdir -p "$DKIM_DIR"

log "Generating DKIM key for ${DOMAIN} (selector: ${SELECTOR}, bits: ${KEY_SIZE})..."

# Generate DKIM key pair using rspamadm if available, otherwise openssl
if command -v rspamadm &>/dev/null; then
    rspamadm dkim_keygen \
        -s "$SELECTOR" \
        -d "$DOMAIN" \
        -b "$KEY_SIZE" \
        -k "$KEY_FILE" \
        > "$PUB_FILE" 2>/dev/null
else
    # Fallback: generate with openssl
    openssl genrsa -out "$KEY_FILE" "$KEY_SIZE" 2>/dev/null

    # Extract public key and format as DNS record
    PUB_KEY=$(openssl rsa -in "$KEY_FILE" -pubout -outform PEM 2>/dev/null | \
        grep -v '^-' | tr -d '\n')

    echo "v=DKIM1; k=rsa; p=${PUB_KEY}" > "$PUB_FILE"
fi

# Set permissions
chmod 600 "$KEY_FILE"
chmod 644 "$PUB_FILE"
chown -R _rspamd:_rspamd "$KEY_FILE" "$PUB_FILE"

# Verify key
log "Verifying key..."
if openssl rsa -in "$KEY_FILE" -check -noout 2>/dev/null; then
    log "Private key is valid"
else
    error "Generated key failed validation!"
fi

# Display results
DKIM_RECORD=$(cat "$PUB_FILE")

echo ""
echo "=========================================="
echo "  DKIM Key Generated Successfully"
echo "=========================================="
echo ""
echo "  Domain:   $DOMAIN"
echo "  Selector: $SELECTOR"
echo "  Key Size: ${KEY_SIZE} bits"
echo ""
echo "  Private Key: $KEY_FILE"
echo "  Public Key:  $PUB_FILE"
echo ""
echo "  ───────────────────────────────────────"
echo "  DNS TXT Record to Add:"
echo "  ───────────────────────────────────────"
echo ""
echo "  Name:  ${SELECTOR}._domainkey.${DOMAIN}"
echo ""
echo "  Value: ${DKIM_RECORD}"
echo ""
echo "  ───────────────────────────────────────"
echo ""
echo "  Notes:"
echo "    - If the record is > 255 chars, your DNS provider"
echo "      may need to split it into 255-char chunks"
echo "    - Some providers require wrapping in quotes"
echo "    - Allow 24-48h for DNS propagation"
echo ""
echo "  Verify with:"
echo "    dig TXT ${SELECTOR}._domainkey.${DOMAIN} +short"
echo "    rspamadm dkim_keytest -d ${DOMAIN} -s ${SELECTOR} -k ${KEY_FILE}"
echo "=========================================="

# Update Rspamd config if domain block doesn't exist
RSPAMD_CONF="/etc/rspamd/local.d/dkim_signing.conf"
if [[ -f "$RSPAMD_CONF" ]] && ! grep -q "domain.*$DOMAIN" "$RSPAMD_CONF" 2>/dev/null; then
    cat >> "$RSPAMD_CONF" <<DKIMCONF

domain {
    ${DOMAIN} {
        selector = "${SELECTOR}";
        path = "${KEY_FILE}";
    }
}
DKIMCONF
    log "Added domain block to $RSPAMD_CONF"
    systemctl restart rspamd 2>/dev/null || true
fi
