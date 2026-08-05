#!/usr/bin/env bash
# CMP Mail Platform - Uninstall Script
set -euo pipefail

CMP_HOME="/opt/cmp"
CMP_USER="cmp"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[CMP]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Must run as root"

echo ""
echo "=========================================="
echo "  CMP Mail Platform - Uninstall"
echo "=========================================="
echo ""
echo "WARNING: This will remove all CMP services, configs, and data."
echo ""
read -rp "Type 'yes' to proceed: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }

# Stop and disable services
log "Stopping CMP services..."
for svc in cmp-api cmp-portal cmp-worker cmp-scheduler cmp.target; do
    systemctl stop "${svc}.service" 2>/dev/null || true
    systemctl disable "${svc}.service" 2>/dev/null || true
    rm -f "/etc/systemd/system/${svc}.service"
done
systemctl daemon-reload

# Remove Nginx config
log "Removing Nginx config..."
rm -f /etc/nginx/sites-enabled/cmp.conf
rm -f /etc/nginx/sites-available/cmp.conf
nginx -t && systemctl reload nginx 2>/dev/null || true

# Remove Postfix configs
log "Removing Postfix configs..."
for f in pgsql-virtual.cf pgsql-mailbox.cf; do
    rm -f "/etc/postfix/$f"
done

# Remove Rspamd configs
log "Removing Rspamd local.d configs..."
rm -f /etc/rspamd/local.d/*.conf /etc/rspamd/local.d/*.inc

# Remove OpenDKIM
log "Removing OpenDKIM configs..."
rm -f /etc/opendkim/KeyTable /etc/opendkim/SigningTable /etc/opendkim/TrustedHosts
rm -rf /etc/opendkim/keys/cmp.local

# Remove CMP application directory
log "Removing CMP application directory..."
rm -rf "$CMP_HOME"

# Remove logs
log "Removing CMP logs..."
rm -rf /var/log/cmp

# Remove vhost mail directory
read -rp "Remove mail vhosts (/var/mail/vhosts)? [y/N]: " rm_mail
if [[ "$rm_mail" =~ ^[Yy]$ ]]; then
    rm -rf /var/mail/vhosts
    log "Mail vhosts removed"
fi

# Remove credentials
rm -f "${PROJECT_DIR}/.credentials"

# Remove run directory
rm -rf /run/cmp

# Optionally remove system user
read -rp "Remove system user '$CMP_USER'? [y/N]: " rm_user
if [[ "$rm_user" =~ ^[Yy]$ ]]; then
    userdel "$CMP_USER" 2>/dev/null || true
    log "User $CMP_USER removed"
fi

echo ""
echo "=========================================="
echo "  CMP Uninstall Complete"
echo "=========================================="
echo ""
echo "  The following were NOT removed:"
echo "    - System packages (postgresql, redis, nginx, etc.)"
echo "    - PostgreSQL database '$DB_NAME'"
echo "    - SSL certificates"
echo "    - Postfix/Dovecot base configs"
echo ""
echo "  To fully remove packages:"
echo "    apt purge postgresql redis-server postfix dovecot-*"
echo "    apt purge rspamd clamav opendkim nginx"
echo "=========================================="
