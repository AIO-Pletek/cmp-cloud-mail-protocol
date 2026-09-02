#!/bin/bash
# CMP Database Backup Script
# Runs daily, keeps 7 daily + 4 weekly backups

set -e

BACKUP_DIR="/var/backups/cmp"
DB_NAME="cmp"
DB_USER="cmp"
DB_HOST="127.0.0.1"
RETENTION_DAILY=7
RETENTION_WEEKLY=4
DATE=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday

# Create backup directory
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

# Read DB password
DB_PASS=$(grep DB_PASSWORD /opt/cmp/.env | cut -d= -f2 | tr -d '[:space:]')
export PGPASSWORD="$DB_PASS"

# Backup PostgreSQL
echo "[$(date)] Starting CMP database backup..."
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_DIR/daily/cmp_${DATE}.dump"

# Backup email logs (last 30 days)
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
COPY (SELECT * FROM email_logs WHERE timestamp >= NOW() - INTERVAL '30 days') 
TO PROGRAM 'gzip > $BACKUP_DIR/daily/email_logs_${DATE}.csv.gz' WITH CSV HEADER;
" 2>/dev/null || true

# Backup DKIM keys
tar -czf "$BACKUP_DIR/daily/dkim_keys_${DATE}.tar.gz" -C / etc/opendkim/keys 2>/dev/null || true

# Backup CMP config
tar -czf "$BACKUP_DIR/daily/cmp_config_${DATE}.tar.gz" -C / opt/cmp/.env etc/cmp 2>/dev/null || true

# Backup Postfix config
tar -czf "$BACKUP_DIR/daily/postfix_config_${DATE}.tar.gz" -C / etc/postfix 2>/dev/null || true

# Calculate size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR/daily/" | cut -f1)
echo "[$(date)] Backup completed. Size: $TOTAL_SIZE"

# Copy to weekly on Sunday (day 7)
if [ "$DAY_OF_WEEK" = "7" ]; then
    echo "[$(date)] Sunday - copying to weekly backup..."
    cp "$BACKUP_DIR/daily/cmp_${DATE}.dump" "$BACKUP_DIR/weekly/"
    cp "$BACKUP_DIR/daily/email_logs_${DATE}.csv.gz" "$BACKUP_DIR/weekly/"
    cp "$BACKUP_DIR/daily/dkim_keys_${DATE}.tar.gz" "$BACKUP_DIR/weekly/"
    cp "$BACKUP_DIR/daily/cmp_config_${DATE}.tar.gz" "$BACKUP_DIR/weekly/"
fi

# Cleanup old daily backups (keep last N)
cd "$BACKUP_DIR/daily"
ls -t cmp_*.dump 2>/dev/null | tail -n +$((RETENTION_DAILY + 1)) | xargs -r rm -f
ls -t email_logs_*.csv.gz 2>/dev/null | tail -n +$((RETENTION_DAILY + 1)) | xargs -r rm -f
ls -t dkim_keys_*.tar.gz 2>/dev/null | tail -n +$((RETENTION_DAILY + 1)) | xargs -r rm -f
ls -t cmp_config_*.tar.gz 2>/dev/null | tail -n +$((RETENTION_DAILY + 1)) | xargs -r rm -f
ls -t postfix_config_*.tar.gz 2>/dev/null | tail -n +$((RETENTION_DAILY + 1)) | xargs -r rm -f

# Cleanup old weekly backups (keep last N)
cd "$BACKUP_DIR/weekly"
ls -t cmp_*.dump 2>/dev/null | tail -n +$((RETENTION_WEEKLY + 1)) | xargs -r rm -f
ls -t email_logs_*.csv.gz 2>/dev/null | tail -n +$((RETENTION_WEEKLY + 1)) | xargs -r rm -f
ls -t dkim_keys_*.tar.gz 2>/dev/null | tail -n +$((RETENTION_WEEKLY + 1)) | xargs -r rm -f
ls -t cmp_config_*.tar.gz 2>/dev/null | tail -n +$((RETENTION_WEEKLY + 1)) | xargs -r rm -f

echo "[$(date)] Backup cleanup done."
echo "[$(date)] Daily backups: $(ls "$BACKUP_DIR/daily/" | wc -l) files"
echo "[$(date)] Weekly backups: $(ls "$BACKUP_DIR/weekly/" | wc -l) files"
