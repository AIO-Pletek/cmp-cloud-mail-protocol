# CMP - Cloud Mail Protocol

A production-ready, self-hosted mail security and management platform built on Postfix, Dovecot, Rspamd, ClamAV, and a modern web portal.

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Internet                        │
                    └──────────┬──────────────────────┬───────────┘
                               │                      │
                          Port 25/465/587         Port 443
                               │                      │
                    ┌──────────▼──────────┐ ┌────────▼──────────┐
                    │      Postfix        │ │      Nginx         │
                    │   (SMTP/MTA)        │ │  (Reverse Proxy)   │
                    └──────────┬──────────┘ └────────┬──────────┘
                               │                      │
                    ┌──────────▼──────────┐    ┌──────▼──────┐
                    │      Rspamd         │    │  CMP Portal  │
                    │  (Spam/Virus/DKIM)  │    │   (Next.js)  │
                    └────┬─────┬──────────┘    └──────┬──────┘
                         │     │                       │
                    ┌────▼┐  ┌▼──────┐          ┌─────▼─────┐
                    │ClamAV│ │OpenDKIM│          │  CMP API   │
                    └──────┘ └───────┘          │  (FastAPI)  │
                                                └──────┬──────┘
                                                       │
                              ┌──────────┬─────────────┼──────────┐
                              │          │             │          │
                         ┌────▼───┐ ┌────▼──┐ ┌───────▼──┐ ┌────▼─────┐
                         │PostgreSQL│ │ Redis │ │  Celery  │ │  Dovecot │
                         │  (DB)   │ │(Cache)│ │(Workers) │ │  (IMAP)  │
                         └─────────┘ └───────┘ └──────────┘ └──────────┘
```

## Features

- **Multi-domain mail hosting** with PostgreSQL-backed virtual domains/users
- **Spam filtering** via Rspamd with Bayesian classification, greylisting, and DNSBL
- **Virus scanning** via ClamAV with automatic signature updates
- **DKIM signing/verification** via Rspamd with per-domain key management
- **SPF/DMARC/ARC** validation
- **TLS encryption** on all connections (opportunistic inbound, mandatory outbound)
- **Web portal** for administrators and domain users
- **REST API** for programmatic management
- **Quarantine management** with user-facing release/delete
- **Background processing** via Celery workers
- **Automated backups** and health monitoring

## Directory Structure

```
/home/odnaz/cmp/
├── config/
│   ├── postfix/          # Postfix MTA configuration
│   │   ├── main.cf
│   │   ├── master.cf
│   │   ├── pgsql-virtual.cf
│   │   └── pgsql-mailbox.cf
│   ├── rspamd/           # Rspamd spam filter configuration
│   │   ├── rspamd.conf
│   │   └── local.d/      # 10 local.d override configs
│   ├── clamav/           # ClamAV antivirus configuration
│   │   ├── clamd.conf
│   │   └── freshclam.conf
│   ├── opendkim/         # OpenDKIM configuration
│   │   └── opendkim.conf
│   ├── nginx/            # Nginx reverse proxy
│   │   └── cmp.conf
│   ├── systemd/          # Systemd service units
│   │   ├── cmp-api.service
│   │   ├── cmp-portal.service
│   │   ├── cmp-worker.service
│   │   └── cmp-scheduler.service
│   └── templates/        # Email and DNS templates
│       ├── dns_records.json
│       └── email_templates/
├── scripts/              # Operational scripts
│   ├── install.sh        # Full installation
│   ├── uninstall.sh      # Clean removal
│   ├── backup.sh         # Database + config backup
│   ├── restore.sh        # Restore from backup
│   ├── ssl-setup.sh      # SSL certificate setup
│   ├── health-check.sh   # System health verification
│   ├── add-domain.sh     # Add mail domain
│   └── generate-dkim.sh  # Generate DKIM keys
├── docs/                 # Documentation
│   ├── README.md         # This file
│   ├── DEPLOYMENT.md     # Deployment guide
│   ├── API.md            # API reference
│   └── ADMIN.md          # Administration guide
└── .env.example          # Environment template
```

## Quick Start

### Prerequisites

- Ubuntu 22.04+ or Debian 12+
- Root access
- A domain with DNS control
- Ports 25, 80, 443, 465, 587, 993 open

### Installation

```bash
# Clone the repository
git clone <repo-url> /home/odnaz/cmp
cd /home/odnaz/cmp

# Run installation as root
sudo bash scripts/install.sh

# Set up SSL certificates
sudo bash scripts/ssl-setup.sh mail.cmp.local admin@cmp.local letsencrypt

# Verify installation
sudo bash scripts/health-check.sh
```

### Add Your First Domain

```bash
sudo bash scripts/add-domain.sh example.com
```

This generates DKIM keys, adds the domain to the database, and displays required DNS records.

## Services

| Service | Port | Description |
|---------|------|-------------|
| Postfix | 25, 465, 587 | SMTP server (receive & send mail) |
| Dovecot | 993 | IMAP server (mailbox access) |
| Nginx | 80, 443 | Reverse proxy for web UI |
| CMP API | 8000 | REST API backend (FastAPI) |
| CMP Portal | 3000 | Web frontend (Next.js) |
| Celery Worker | - | Background task processing |
| Celery Beat | - | Scheduled task runner |
| Rspamd | 11332, 11334 | Spam filtering + DKIM |
| ClamAV | 3310 | Virus scanning |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache + message broker |

## Configuration

All service configurations are stored in `/home/odnaz/cmp/config/` and installed to their system locations by `install.sh`. The application environment is configured via `/opt/cmp/.env`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed configuration guidance.

## Backup & Recovery

```bash
# Create backup (database, configs, mail, DKIM keys)
sudo bash scripts/backup.sh

# List backups
ls -la /opt/cmp/backups/

# Restore from backup
sudo bash scripts/restore.sh /opt/cmp/backups/cmp_backup_YYYYMMDD_HHMMSS.tar.gz
```

Backups are automatically retained for 30 days.

## License

Proprietary - All rights reserved.

## Support

- Documentation: `/home/odnaz/cmp/docs/`
- Health check: `scripts/health-check.sh`
- Logs: `journalctl -u cmp-api -f` or `/var/log/cmp/`
