#!/usr/bin/env bash
# CMP Mail Platform - Restore Script
set -euo pipefail

CMP_HOME="/opt/cmp"
BACKUP_DIR="${CMP_HOME}/backups"

source "${CMP_HOME}/.env" 2>/dev/null || true

DB_NAME="${DB_NAME:-cmp}"
DB_USER="${DB_USER:-cmp}"
DB_HOST="${DB_HOST:-127.0.0.1}"

log()   { echo "[CMP-Restore] $*"; }
error() { echo "[CMP-Restore ERROR] $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || error "Must run as root"

# List available backups
echo ""
echo "Available backups:"
echo "-------------------------------------------"
if [[ -d "$BACKUP_DIR" ]]; then
    ls -lht "${BACKUP_DIR}"/cmp_backup_*.tar.gz 2>/dev/null | head -20
else
    error "No backup directory found at $BACKUP_DIR"
fi
echo "-------------------------------------------"
echo ""

# Select backup
if [[ -n "${1:-}" ]]; then
    BACKUP_FILE="$1"
else
    read -rp "Enter backup file path: " BACKUP_FILE
fi
[[ -f "$BACKUP_FILE" ]] || error "Backup file not found: $BACKUP_FILE"

echo ""
echo "WARNING: This will overwrite current CMP data and configurations."
echo "Backup: $BACKUP_FILE"
echo ""
read -rp "Type 'yes' to proceed: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }

# Stop services
log "Stopping CMP services..."
for svc in cmp-api cmp-portal cmp-worker cmp-scheduler; do
    systemctl stop "${svc}.service" 2>/dev/null || true
done

# Extract to temp directory
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

log "Extracting backup..."
tar xzf "$BACKUP_FILE" -C "$TMPDIR"

# Restore database
if [[ -f "${TMPDIR}/database.dump" ]]; then
    log "Restoring PostgreSQL database (custom format)..."
    sudo -u postgres dropdb "$DB_NAME" 2>/dev/null || true
    sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
    PGPASSWORD="${DB_PASSWORD:-}" pg_restore -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
        --no-owner --no-privileges "${TMPDIR}/database.dump" 2>/dev/null || \
        log "WARN: pg_restore had warnings (some may be non-fatal)"
elif [[ -f "${TMPDIR}/database.sql" ]]; then
    log "Restoring PostgreSQL database (SQL format)..."
    sudo -u postgres dropdb "$DB_NAME" 2>/dev/null || true
    sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
    sudo -u postgres psql "$DB_NAME" < "${TMPDIR}/database.sql"
fi

# Restore mail vhosts
if [[ -f "${TMPDIR}/mail_vhosts.tar.gz" ]]; then
    log "Restoring mail vhosts..."
    mkdir -p /var/mail/vhosts
    tar xzf "${TMPDIR}/mail_vhosts.tar.gz" -C /
fi

# Restore configurations
if [[ -f "${TMPDIR}/configs.tar.gz" ]]; then
    log "Restoring configurations..."
    tar xzf "${TMPDIR}/configs.tar.gz" -C / 2>/dev/null || \
        log "WARN: Some config files could not be restored"
fi

# Restore DKIM keys
if [[ -d "${TMPDIR}/dkim_keys" ]]; then
    log "Restoring DKIM keys..."
    cp -r "${TMPDIR}/dkim_keys"/* /var/lib/rspamd/dkim/ 2>/dev/null || true
fi

# Restore environment
if [[ -f "${TMPDIR}/env.backup" ]]; then
    log "Restoring environment file..."
    cp "${TMPDIR}/env.backup" "${CMP_HOME}/.env"
    chown cmp:cmp "${CMP_HOME}/.env"
    chmod 640 "${CMP_HOME}/.env"
fi

# Fix permissions
log "Fixing permissions..."
chown -R cmp:cmp "$CMP_HOME"
chown -R _rspamd:_rspamd /var/lib/rspamd 2>/dev/null || true
chown -R opendkim:opendkim /etc/opendkim/keys 2>/dev/null || true

# Restart services
log "Restarting services..."
systemctl restart postfix dovecot rspamd clamav-daemon opendkim nginx 2>/dev/null || true
for svc in cmp-api cmp-portal cmp-worker cmp-scheduler; do
    systemctl start "${svc}.service" 2>/dev/null || true
done

echo ""
echo "=========================================="
echo "  CMP Restore Complete"
echo "=========================================="
echo "  Backup: $BACKUP_FILE"
echo "  Run: scripts/health-check.sh to verify"
echo "=========================================="
