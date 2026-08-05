#!/usr/bin/env bash
# CMP Mail Platform - SSL Setup Script
# Supports: Let's Encrypt (production) and self-signed (development)
set -euo pipefail

DOMAIN="${1:-mail.cmp.local}"
EMAIL="${2:-admin@cmp.local}"
MODE="${3:-letsencrypt}"  # letsencrypt or selfsigned
CMP_HOME="/opt/cmp"

log()   { echo "[CMP-SSL] $*"; }
error() { echo "[CMP-SSL ERROR] $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || error "Must run as root"

case "$MODE" in
    letsencrypt|le)
        log "Setting up Let's Encrypt certificate for $DOMAIN..."

        # Ensure certbot is installed
        command -v certbot &>/dev/null || apt-get install -y certbot python3-certbot-nginx

        # Ensure Nginx is running
        systemctl is-active nginx || systemctl start nginx

        # Stop services temporarily on port 80
        log "Requesting certificate..."

        certbot certonly --nginx \
            -d "$DOMAIN" \
            --non-interactive \
            --agree-tos \
            --email "$EMAIL" \
            --redirect \
            --staple-ocsp \
            --must-staple \
            || certbot certonly --standalone \
                -d "$DOMAIN" \
                --non-interactive \
                --agree-tos \
                --email "$EMAIL"

        # Copy certs to CMP locations
        CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

        log "Linking certificates..."
        ln -sf "${CERT_PATH}/fullchain.pem" /etc/ssl/certs/cmp.pem
        ln -sf "${CERT_PATH}/privkey.pem" /etc/ssl/private/cmp.key
        ln -sf "${CERT_PATH}/chain.pem" /etc/ssl/certs/cmp-ca.pem

        # Setup auto-renewal
        cat > /etc/cron.d/cmp-ssl-renewal <<'CRON'
# CMP SSL Certificate Auto-Renewal
0 3 * * * root certbot renew --quiet --post-hook "systemctl reload nginx postfix dovecot" 2>/dev/null
CRON
        chmod 644 /etc/cron.d/cmp-ssl-renewal

        log "Let's Encrypt certificate installed successfully"
        log "Auto-renewal configured via /etc/cron.d/cmp-ssl-renewal"
        ;;

    selfsigned|ss)
        log "Generating self-signed certificate for $DOMAIN..."

        # Generate private key
        openssl genrsa -out /etc/ssl/private/cmp.key 2048

        # Generate CSR
        openssl req -new \
            -key /etc/ssl/private/cmp.key \
            -out /tmp/cmp.csr \
            -subj "/CN=${DOMAIN}/O=CMP Mail Platform/OU=Mail"

        # Create SAN extension file
        cat > /tmp/cmp_ext.cnf <<EXT
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName=@alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = cmp.local
DNS.3 = *.cmp.local
IP.1 = 127.0.0.1
EXT

        # Generate self-signed certificate (10 years)
        openssl x509 -req \
            -in /tmp/cmp.csr \
            -signkey /etc/ssl/private/cmp.key \
            -out /etc/ssl/certs/cmp.pem \
            -days 3650 \
            -sha256 \
            -extfile /tmp/cmp_ext.cnf

        # Use same cert as CA (self-signed)
        cp /etc/ssl/certs/cmp.pem /etc/ssl/certs/cmp-ca.pem

        # Cleanup
        rm -f /tmp/cmp.csr /tmp/cmp_ext.cnf

        # Set permissions
        chmod 600 /etc/ssl/private/cmp.key
        chmod 644 /etc/ssl/certs/cmp.pem /etc/ssl/certs/cmp-ca.pem

        log "Self-signed certificate generated (valid 10 years)"
        log "Certificate: /etc/ssl/certs/cmp.pem"
        log "Private Key: /etc/ssl/private/cmp.key"
        ;;

    *)
        echo "Usage: $0 [domain] [email] [letsencrypt|selfsigned]"
        echo ""
        echo "Examples:"
        echo "  $0 mail.cmp.local admin@cmp.local letsencrypt"
        echo "  mail.cmp.local admin@cmp.local selfsigned"
        exit 1
        ;;
esac

# Verify certificate
log "Verifying certificate..."
openssl x509 -in /etc/ssl/certs/cmp.pem -noout -subject -dates -fingerprint

# Restart services that use the certificate
log "Restarting services..."
systemctl reload nginx 2>/dev/null || true
systemctl restart postfix 2>/dev/null || true
systemctl restart dovecot 2>/dev/null || true

echo ""
echo "=========================================="
echo "  SSL Setup Complete"
echo "=========================================="
echo "  Domain:     $DOMAIN"
echo "  Mode:       $MODE"
echo "  Certificate: /etc/ssl/certs/cmp.pem"
echo "  Key:         /etc/ssl/private/cmp.key"
echo "=========================================="
