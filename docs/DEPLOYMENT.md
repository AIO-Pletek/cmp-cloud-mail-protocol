# CMP Deployment Guide

## System Requirements

### Minimum Hardware

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 100 GB SSD |
| Network | 100 Mbps | 1 Gbps |

### Software

- **OS:** Ubuntu 22.04 LTS or Debian 12
- **Python:** 3.10+
- **Node.js:** 18 LTS+
- **PostgreSQL:** 14+
- **Redis:** 6+

## Pre-Installation

### 1. DNS Configuration

Before installing, configure DNS for your mail domain. See `config/templates/dns_records.json` for the complete record set.

**Minimum required records:**

```
; A record for mail server
mail.example.com.    IN  A      203.0.113.10

; MX record
example.com.         IN  MX  10  mail.example.com.

; SPF
example.com.         IN  TXT    "v=spf1 mx a ip4:203.0.113.10 -all"

; PTR (reverse DNS - set via hosting provider)
10.113.0.203.in-addr.arpa. IN PTR mail.example.com.
```

**After installation, add DKIM and DMARC:**

```
; DKIM (get actual key from scripts/generate-dkim.sh or add-domain.sh)
cmp._domainkey.example.com. IN TXT "v=DKIM1; k=rsa; p=MIIB..."

; DMARC
_dmarc.example.com.  IN TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@example.com"
```

### 2. Firewall

Open required ports:

```bash
ufw allow 25/tcp    # SMTP
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw allow 465/tcp   # SMTPS
ufw allow 587/tcp   # Submission
ufw allow 993/tcp   # IMAPS
ufw enable
```

### 3. Reverse DNS (PTR Record)

Most mail servers reject mail from IPs without matching PTR records. Set this via your hosting provider's control panel.

## Installation

### Automated Install

```bash
cd /home/odnaz/cmp
sudo bash scripts/install.sh
```

The install script is **idempotent** - safe to run multiple times. It will:

1. Install all system packages (Postfix, Dovecot, Rspamd, ClamAV, Nginx, PostgreSQL, Redis)
2. Create the `cmp` system user
3. Set up the PostgreSQL database and user
4. Configure all mail services
5. Build the Python API and Next.js portal
6. Install and enable systemd services
7. Generate self-signed SSL certificates
8. Create the `.env` configuration file
9. Save initial credentials to `.credentials`

### Post-Install Steps

```bash
# 1. Review and edit environment
sudo vim /opt/cmp/.env

# 2. Set up real SSL certificates
sudo bash scripts/ssl-setup.sh mail.example.com admin@example.com letsencrypt

# 3. Add your first domain
sudo bash scripts/add-domain.sh example.com

# 4. Verify everything is working
sudo bash scripts/health-check.sh

# 5. Delete credentials file after securing passwords
sudo rm /home/odnaz/cmp/.credentials
```

## Configuration Reference

### Environment Variables (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://cmp:***@127.0.0.1:5432/cmp` |
| `DB_HOST` | Database host | `127.0.0.1` |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | `cmp` |
| `DB_USER` | Database user | `cmp` |
| `DB_PASSWORD` | Database password | (generated) |
| `REDIS_URL` | Redis connection string | `redis://127.0.0.1:6379/0` |
| `SECRET_KEY` | Application secret key | (generated) |
| `APP_ENV` | Environment (`production`/`development`) | `production` |
| `APP_URL` | Application URL | `https://mail.cmp.local` |
| `PORTAL_URL` | Portal frontend URL | `https://mail.cmp.local` |
| `CLAMAV_HOST` | ClamAV host | `127.0.0.1` |
| `CLAMAV_PORT` | ClamAV port | `3310` |
| `RSPAMD_URL` | Rspamd controller URL | `http://127.0.0.1:11334` |
| `RSPAMD_PASSWORD` | Rspamd controller password | (from config) |
| `LOG_LEVEL` | Logging level | `info` |
| `CELERY_BROKER_URL` | Celery broker URL | `redis://127.0.0.1:6379/1` |
| `CELERY_RESULT_BACKEND` | Celery result backend | `redis://127.0.0.1:6379/2` |

### Postfix

Key configuration files:

- `/etc/postfix/main.cf` - Main configuration
- `/etc/postfix/master.cf` - Service definitions
- `/etc/postfix/pgsql-virtual.cf` - Virtual domain lookup
- `/etc/postfix/pgsql-mailbox.cf` - Virtual mailbox lookup

Content filtering flow: `Postfix → Rspamd (port 10025) → Re-inject (port 10025) → Delivery`

### Rspamd

- Web UI: `http://127.0.0.1:11334` (controller)
- Milter socket: `127.0.0.1:11332`
- Config overrides: `/etc/rspamd/local.d/*.conf`

Spam thresholds:
- **Greylist:** score ≥ 4
- **Add header:** score ≥ 6
- **Rewrite subject:** score ≥ 8
- **Reject:** score ≥ 15

### Nginx

- `/etc/nginx/sites-available/cmp.conf` - Main site config
- Rate limiting: 30 req/s (API), 5 req/min (login), 50 req/s (portal)
- WebSocket support for `/ws/` and Next.js HMR
- Security headers: HSTS, CSP, X-Frame-Options, etc.

## Database Schema

The CMP database uses the following core tables:

```sql
-- Mail domains
CREATE TABLE mail_domains (
    id SERIAL PRIMARY KEY,
    domain_name VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Mail users (virtual mailboxes)
CREATE TABLE mail_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL REFERENCES mail_domains(domain_name),
    password_hash VARCHAR(255) NOT NULL,
    quota_mb INTEGER DEFAULT 1024,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Quarantine
CREATE TABLE quarantine (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255),
    recipient VARCHAR(255) NOT NULL,
    sender VARCHAR(255),
    subject TEXT,
    reason VARCHAR(100),
    score FLOAT,
    raw_message BYTEA,
    created_at TIMESTAMP DEFAULT NOW(),
    released_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Audit log
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## TLS Certificate Management

### Let's Encrypt (Recommended)

```bash
scripts/ssl-setup.sh mail.example.com admin@example.com letsencrypt
```

Auto-renewal is configured via cron. Certificates are symlinked to:
- `/etc/ssl/certs/cmp.pem` (certificate + chain)
- `/etc/ssl/private/cmp.key` (private key)
- `/etc/ssl/certs/cmp-ca.pem` (CA chain)

### Self-Signed (Development)

```bash
scripts/ssl-setup.sh mail.example.com admin@example.com selfsigned
```

## Troubleshooting

### Mail Not Being Received

1. Check DNS MX records: `dig MX example.com +short`
2. Check port 25 is open: `ss -tlnp | grep :25`
3. Check Postfix logs: `journalctl -u postfix -f`
4. Check Rspamd logs: `tail -f /var/log/rspamd/rspamd.log`

### Mail Going to Spam

1. Verify SPF: `dig TXT example.com +short`
2. Verify DKIM: `dig TXT cmp._domainkey.example.com +short`
3. Verify DMARC: `dig TXT _dmarc.example.com +short`
4. Verify PTR: `dig -x <IP> +short`
5. Check score at [mail-tester.com](https://www.mail-tester.com/)

### Service Won't Start

```bash
# Check service status
systemctl status cmp-api.service

# Check logs
journalctl -u cmp-api.service -n 100

# Run health check
scripts/health-check.sh
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
sudo -u postgres psql -c "SELECT 1"

# Test app connection
PGPASSWORD=<password> psql -h 127.0.0.1 -U cmp -d cmp -c "SELECT 1"
```
