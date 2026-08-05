#!/usr/bin/env bash
# CMP Mail Platform - Backup Script
set -euo pipefail

CMP_HOME="/opt/cmp"
BACKUP_DIR="${CMP_HOME}/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/cmp_backup_${TIMESTAMP}.tar.gz"
RETENTION_DAYS=30

source "${CMP_HOME}/.env" 2>/dev/null || true

DB_NAME="${DB_NAME:-cmp}"
DB_USER="${DB_USER:-cmp}"
DB_HOST="${DB_HOST:-127.0.0.1}"

log() { echo "[CMP-Backup] $*"; }

mkdir -p "$BACKUP_DIR"

log "Starting backup: $TIMESTAMP"

# Create temp directory
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Dump PostgreSQL database
log "Dumping PostgreSQL database..."
PGPASSWORD="${DB_PASSWORD:-}" pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    --format=custom --compress=6 \
    -f "${TMPDIR}/database.dump" 2>/dev/null || {
    log "WARN: pg_dump failed, trying plain SQL dump"
    sudo -u postgres pg_dump "$DB_NAME" > "${TMPDIR}/database.sql" 2>/dev/null || \
        log "ERROR: Database backup failed"
}

# Backup mail vhosts
if [[ -d /var/mail/vhosts ]]; then
    log "Backing up mail vhosts..."
    tar czf "${TMPDIR}/mail_vhosts.tar.gz" -C / var/mail/vhosts 2>/dev/null || \
        log "WARN: Mail vhosts backup failed"
fi

# Backup configurations
log "Backing up configurations..."
tar czf "${TMPDIR}/configs.tar.gz" \
    /etc/postfix/main.cf /etc/postfix/master.cf \
    /etc/postfix/pgsql-virtual.cf /etc/postfix/pgsql-mailbox.cf \
    /etc/dovecot/dovecot.conf /etc/dovecot/dovecot-sql.conf.ext \
    /etc/rspamd/local.d/ \
    /etc/clamav/clamd.conf /etc/clamav/freshclam.conf \
    /etc/opendkim/opendkim.conf /etc/opendkim/KeyTable \
    /etc/opendkim/SigningTable /etc/opendkim/TrustedHosts \
    /etc/opendkim/keys/ \
    /etc/nginx/sites-available/cmp.conf \
    /etc/ssl/certs/cmp.pem /etc/ssl/private/cmp.key \
    2>/dev/null || log "WARN: Some config files missing"

# Backup DKIM keys
if [[ -d /var/lib/rspamd/dkim ]]; then
    cp -r /var/lib/rspamd/dkim "${TMPDIR}/dkim_keys" 2>/dev/null || true
fi

# Backup environment file
cp "${CMP_HOME}/.env" "${TMPDIR}/env.backup" 2>/dev/null || true

# Backup Celery schedule
cp "${CMP_HOME}/data/celerybeat-schedule" "${TMPDIR}/celerybeat-schedule" 2>/dev/null || true

# Create final archive
log "Creating backup archive..."
tar czf "$BACKUP_FILE" -C "$TMPDIR" .

# Set permissions
chmod 600 "$BACKUP_FILE"

# Cleanup old backups
log "Cleaning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "cmp_backup_*.tar.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

# Report
BACKUP_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
log "Backup complete: $BACKUP_FILE ($BACKUP_SIZE)"
log "Total backups: $(ls -1 "${BACKUP_DIR}"/cmp_backup_*.tar.gz 2>/dev/null | wc -l)"
