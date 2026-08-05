# CMP Administration Guide

## Daily Operations

### Checking System Health

```bash
# Full health check
sudo bash /home/odnaz/cmp/scripts/health-check.sh

# Quick service status
systemctl status cmp-api cmp-portal cmp-worker cmp-scheduler

# View service logs
journalctl -u cmp-api -f
journalctl -u cmp-worker -f
```

### Monitoring Mail Flow

```bash
# Watch mail log in real-time
tail -f /var/log/mail.log

# Count messages today
grep "$(date +%b' '%d)" /var/log/mail.log | grep -c "status=sent"

# Check queue size
postqueue -p | tail -1

# Flush stuck mail queue
postsuper -r ALL
```

### Managing Services

```bash
# Restart all CMP services
systemctl restart cmp-api cmp-portal cmp-worker cmp-scheduler

# Restart mail stack
systemctl restart postfix dovecot rspamd clamav-daemon

# View resource usage
systemctl status cmp-api cmp-portal cmp-worker cmp-scheduler | grep -E "Memory|CPU"
```

## Domain Management

### Adding a Domain

```bash
sudo bash /home/odnaz/cmp/scripts/add-domain.sh example.com
```

This will:
1. Generate DKIM keys
2. Add the domain to the database
3. Update Rspamd and OpenDKIM configs
4. Display required DNS records

### Removing a Domain

```sql
-- Via PostgreSQL (soft delete)
sudo -u postgres psql -d cmp -c "UPDATE mail_domains SET is_active = false WHERE domain_name = 'example.com';"
```

### Managing Mailboxes

```sql
-- List mailboxes for a domain
sudo -u postgres psql -d cmp -c "SELECT email, is_active, quota_mb FROM mail_users WHERE domain = 'example.com';"

-- Deactivate a mailbox
sudo -u postgres psql -d cmp -c "UPDATE mail_users SET is_active = false WHERE email = 'user@example.com';"

-- Reset password (generate hash first)
python3 -c "from passlib.hash import bcrypt; print(bcrypt.using(rounds=12).hash('new_password'))"
sudo -u postgres psql -d cmp -c "UPDATE mail_users SET password_hash = '<hash>' WHERE email = 'user@example.com';"
```

## Spam Management

### Viewing Rspamd Statistics

```bash
# Rspamd web UI (from localhost)
curl http://127.0.0.1:11334/stat

# Command line stats
rspamc stat
```

### Adjusting Spam Thresholds

Edit `/etc/rspamd/local.d/metrics.conf`:

```
actions {
    reject = 15;        # Reject above this score
    add_header = 6;     # Add spam header above this score
    greylist = 4;       # Greylist above this score
}
```

Then restart Rspamd: `systemctl restart rspamd`

### Whitelisting/Blacklisting

**Whitelist a sender (Rspamd):**
```bash
cat > /etc/rspamd/local.d/whitelist.conf <<'EOF'
whitelist {
    from = ["trusted@example.com", "noreply@service.com"];
    symbol = "WHITELISTED_SENDER";
    score = -10.0;
}
EOF
systemctl restart rspamd
```

**Blacklist a sender:**
```bash
cat > /etc/rspamd/local.d/blacklist.conf <<'EOF'
blacklist {
    from = ["spammer@evil.com"];
    symbol = "BLACKLISTED_SENDER";
    score = 15.0;
}
EOF
systemctl restart rspamd
```

### Training Bayes Filter

```bash
# Learn as spam
rspamc learn_spam /path/to/spam_message.eml

# Learn as ham
rspamc learn_ham /path/to/good_message.eml

# Bulk learn from Maildir
find /var/mail/vhosts/example.com/user/.Junk/cur/ -type f | xargs -I{} rspamc learn_spam {}
find /var/mail/vhosts/example.com/user/.Ham/cur/ -type f | xargs -I{} rspamc learn_ham {}
```

## Virus Management

### Updating Virus Definitions

```bash
# Manual update
sudo freshclam

# Check update status
systemctl status clamav-freshclam

# Check last update
ls -la /var/lib/clamav/*.cvd
```

### Viewing ClamAV Logs

```bash
tail -f /var/log/clamav/clamav.log
```

## DKIM Key Management

### Generate New DKIM Key

```bash
sudo bash /home/odnaz/cmp/scripts/generate-dkim.sh example.com
```

### Rotate DKIM Keys

```bash
# Generate new key with different selector
sudo bash /home/odnaz/cmp/scripts/generate-dkim.sh example.com cmp2

# Update DNS with new selector's public key
# Wait for DNS propagation (24-48h)

# Switch Postfix/Rspamd to use new selector
# Then remove old key
```

### Verify DKIM Configuration

```bash
# Check DNS record
dig TXT cmp._domainkey.example.com +short

# Test DKIM signing
rspamadm dkim_keytest -d example.com -s cmp -k /var/lib/rspamd/dkim/example.com.cmp.key
```

## SSL Certificate Management

### Renew Let's Encrypt Certificate

```bash
# Manual renewal
sudo certbot renew

# Check certificate expiry
openssl x509 -in /etc/ssl/certs/cmp.pem -noout -dates

# Test renewal process
sudo certbot renew --dry-run
```

### Switch to Let's Encrypt from Self-Signed

```bash
sudo bash /home/odnaz/cmp/scripts/ssl-setup.sh mail.example.com admin@example.com letsencrypt
```

## Database Management

### Backup Database Only

```bash
sudo -u postgres pg_dump cmp --format=custom -f /tmp/cmp_db_backup.dump
```

### Restore Database

```bash
sudo -u postgres dropdb cmp
sudo -u postgres createdb -O cmp cmp
sudo -u postgres pg_restore -d cmp /tmp/cmp_db_backup.dump
```

### Database Migrations

```bash
# Run Alembic migrations
cd /opt/cmp/api
source venv/bin/activate
alembic upgrade head

# Check current migration version
alembic current
```

### Connect to Database

```bash
# As postgres superuser
sudo -u postgres psql cmp

# As cmp user
PGPASSWORD=*** psql -h 127.0.0.1 -U cmp cmp
```

## Backup & Recovery

### Automated Backups

Backups run via `scripts/backup.sh` and include:
- PostgreSQL database (custom format)
- All service configurations
- Mail vhosts
- DKIM keys
- Environment file

Schedule via cron:
```bash
# Daily backup at 2 AM
echo "0 2 * * * root /home/odnaz/cmp/scripts/backup.sh >> /var/log/cmp/backup.log 2>&1" > /etc/cron.d/cmp-backup
```

### Manual Backup

```bash
sudo bash /home/odnaz/cmp/scripts/backup.sh
```

### Restore from Backup

```bash
sudo bash /home/odnaz/cmp/scripts/restore.sh /opt/cmp/backups/cmp_backup_20250115_020000.tar.gz
```

## Performance Tuning

### PostgreSQL

```sql
-- Check connection count
SELECT count(*) FROM pg_stat_activity;

-- Check slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

-- Vacuum and analyze
VACUUM ANALYZE;
```

### Postfix

```
# /etc/postfix/main.cf - Adjust for high volume
default_process_limit = 100
smtp_destination_concurrency_limit = 5
smtp_destination_rate_delay = 1s
initial_destination_concurrency = 5
```

### Redis Memory

```bash
redis-cli info memory
redis-cli config set maxmemory 512mb
redis-cli config set maxmemory-policy allkeys-lru
```

## Log Locations

| Service | Log Location |
|---------|-------------|
| CMP API | `journalctl -u cmp-api` or `/var/log/cmp/api.log` |
| CMP Worker | `journalctl -u cmp-worker` |
| Postfix | `/var/log/mail.log` |
| Dovecot | `/var/log/mail.log` |
| Rspamd | `/var/log/rspamd/rspamd.log` |
| ClamAV | `/var/log/clamav/clamav.log` |
| Nginx | `/var/log/nginx/cmp_access.log` |
| PostgreSQL | `/var/log/postgresql/` |

## Security Hardening

### Fail2Ban

```bash
# Enable Postfix jails
cat > /etc/fail2ban/jail.d/cmp.conf <<'EOF'
[postfix]
enabled = true
port = smtp,465,587
filter = postfix
maxretry = 5
bantime = 3600

[postfix-sasl]
enabled = true
port = smtp,465,587
filter = postfix[mode=auth]
maxretry = 3
bantime = 86400
EOF
systemctl restart fail2ban
```

### UFW Firewall

```bash
ufw allow 25/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 465/tcp
ufw allow 587/tcp
ufw allow 993/tcp
ufw enable
```

### Restrict PostgreSQL to Localhost

```bash
# /etc/postgresql/*/main/postgresql.conf
listen_addresses = '127.0.0.1'

# /etc/postgresql/*/main/pg_hba.conf
local   all   all                 peer
host    cmp   cmp   127.0.0.1/32  md5
```

## Troubleshooting Quick Reference

| Problem | Check | Fix |
|---------|-------|-----|
| No mail received | `dig MX domain +short` | Fix DNS MX record |
| Mail in spam folder | Check SPF/DKIM/DMARC | Add missing DNS records |
| Service won't start | `journalctl -u service` | Fix config, check dependencies |
| High CPU usage | `htop`, check worker count | Adjust `--workers` in service file |
| Disk full | `df -h`, `du -sh /var/mail` | Clean old mail, expand disk |
| Certificate expired | `openssl x509 -dates` | Run `ssl-setup.sh` again |
| Database connection error | Check PostgreSQL status | Restart postgresql, check credentials |
