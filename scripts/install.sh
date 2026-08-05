#!/usr/bin/env bash
# CMP Mail Platform - Installation Script
# Target: Ubuntu 22.04 / Debian 12
# Idempotent: safe to run multiple times
set -euo pipefail

# Constants
CMP_USER="cmp"
CMP_GROUP="cmp"
CMP_HOME="/opt/cmp"
CMP_VENV="${CMP_HOME}/venv"
CMP_DATA="${CMP_HOME}/data"
CMP_LOG="/var/log/cmp"
DB_NAME="cmp"
DB_USER="cmp"
DB_PASSWORD="${CM...nssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)}"
VHOST_DIR="/var/mail/vhosts"
MIN_NODE="18"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()   { echo -e "${GREEN}[CMP]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()   { error "$*"; exit 1; }

check_root() { [[ $EUID -eq 0 ]] || die "This script must be run as root"; }
check_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        case "$ID" in
            ubuntu) [[ "${VERSION_ID%%.*}" -ge 22 ]] || die "Ubuntu 22.04+ required" ;;
            debian) [[ "${VERSION_ID%%.*}" -ge 12 ]] || die "Debian 12+ required" ;;
            *) die "Unsupported OS: $ID" ;;
        esac
        log "OS: $PRETTY_NAME"
    else die "Cannot detect OS"; fi
}

install_packages() {
    log "Installing system packages..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq postgresql postgresql-client postgresql-contrib redis-server \
        postfix postfix-pgsql dovecot-core dovecot-imapd dovecot-lmtpd dovecot-pgsql \
        rspamd clamav clamav-daemon clamav-freshclam opendkim opendkim-tools \
        nginx certbot python3-certbot-nginx python3 python3-pip python3-venv python3-dev \
        build-essential libpq-dev libffi-dev libssl-dev curl wget git unzip jq htop \
        fail2ban ufw logrotate cron
    if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt "$MIN_NODE" ]]; then
        log "Installing Node.js ${MIN_NODE}.x..."
        curl -fsSL "https://deb.nodesource.com/setup_${MIN_NODE}.x" | bash -
        apt-get install -y -qq nodejs
    fi
    log "Packages installed"
}

create_user() {
    if ! id "$CMP_USER" &>/dev/null; then
        log "Creating system user: $CMP_USER"
        useradd --system --home-dir "$CMP_HOME" --shell /usr/sbin/nologin --comment "CMP Mail Platform" "$CMP_USER"
    else log "User $CMP_USER already exists"; fi
    usermod -aG clamav,postfix,dovecot "$CMP_USER" 2>/dev/null || true
}

create_directories() {
    log "Creating directories..."
    for d in "$CMP_HOME/api" "$CMP_HOME/portal" "$CMP_HOME/config" "$CMP_HOME/backups" \
             "$CMP_DATA" "$CMP_LOG" "$VHOST_DIR" "/run/cmp" "/var/lib/rspamd/dkim" \
             "/etc/opendkim/keys" "/var/log/rspamd" "/var/log/clamav"; do mkdir -p "$d"; done
    chown -R "$CMP_USER:$CMP_GROUP" "$CMP_HOME" "$CMP_DATA" "$CMP_LOG" "$VHOST_DIR" "/run/cmp"
    chmod 750 "$CMP_HOME"; chmod 755 "$CMP_LOG"
}

setup_postgresql() {
    log "Setting up PostgreSQL..."
    systemctl enable --now postgresql
    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
    [[ -f "${PROJECT_DIR}/api/migrations/init.sql" ]] && \
        PGPASSWORD="${DB_P...n) psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -f "${PROJECT_DIR}/api/migrations/init.sql" 2>/dev/null || true
    log "PostgreSQL configured (db=$DB_NAME user=$DB_USER)"
}

setup_redis() {
    log "Configuring Redis..."
    systemctl enable --now redis-server
    [[ -n "${CMP_REDIS_PASSWORD:-}" ]] && \
        sed -i "s/^# requirepass .*/requirepass ${CMP_REDIS_PASSWORD}/" /etc/redis/redis.conf && \
        systemctl restart redis-server
}

setup_postfix() {
    log "Configuring Postfix..."
    cp "${PROJECT_DIR}/config/postfix/main.cf" /etc/postfix/main.cf
    cp "${PROJECT_DIR}/config/postfix/master.cf" /etc/postfix/master.cf
    for f in pgsql-virtual.cf pgsql-mailbox.cf; do
        cp "${PROJECT_DIR}/config/postfix/$f" "/etc/postfix/$f"
        sed -i "s/\${CMP_DB_PASSWORD}/${DB_PASSWORD}/" "/etc/postfix/$f"
        chmod 640 "/etc/postfix/$f"; chown root:postfix "/etc/postfix/$f"
    done
    printf '/^Received:.*/ IGNORE\n/^X-Originating-IP:/ IGNORE\n' > /etc/postfix/header_checks
    systemctl enable --now postfix
    log "Postfix configured"
}

setup_dovecot() {
    log "Configuring Dovecot..."
    cat > /etc/dovecot/dovecot.conf <<'DCONF'
protocols = imap lmtp
listen = *, ::
base_dir = /run/dovecot/
mail_location = maildir:/var/mail/vhosts/%d/%n/
mail_uid = 1000; mail_gid = 1000; first_valid_uid = 1000; last_valid_uid = 1000
namespace inbox { inbox = yes; separator = / }
passdb { driver = sql; args = /etc/dovecot/dovecot-sql.conf.ext }
userdb { driver = sql; args = /etc/dovecot/dovecot-sql.conf.ext }
service lmtp { unix_listener /var/spool/postfix/private/dovecot-lmtp { mode = 0600; user = postfix; group = postfix; } }
service auth { unix_listener /var/spool/postfix/private/auth { mode = 0660; user = postfix; group = postfix; } }
ssl = required
ssl_cert = </etc/ssl/certs/cmp.pem
ssl_key = </etc/ssl/private/cmp.key
ssl_min_protocol = TLSv1.2
ssl_prefer_server_ciphers = yes
protocol lmtp { postmaster_address = postmaster@cmp.local }
DCONF
    cat > /etc/dovecot/dovecot-sql.conf.ext <<DSQL
driver = pgsql
connect = host=127.0.0.1 dbname=${DB_NAME} user=${DB_USER} password=${DB_PASSWORD}
default_pass_scheme = BLF-CRYPT
password_query = SELECT email as user, password_hash as password FROM mail_users WHERE email = '%u' AND is_active = true
user_query = SELECT '/var/mail/vhosts/%d/%n/' as home, 1000 as uid, 1000 as gid FROM mail_users WHERE email = '%u'
DSQL
    chmod 600 /etc/dovecot/dovecot-sql.conf.ext
    systemctl enable --now dovecot
    log "Dovecot configured"
}

setup_rspamd() {
    log "Configuring Rspamd..."
    mkdir -p /etc/rspamd/local.d
    cp "${PROJECT_DIR}/config/rspamd/rspamd.conf" /etc/rspamd/rspamd.conf
    for f in "${PROJECT_DIR}"/config/rspamd/local.d/*; do cp "$f" "/etc/rspamd/local.d/$(basename "$f")"; done
    mkdir -p /var/log/rspamd; chown -R _rspamd:_rspamd /var/log/rspamd /var/lib/rspamd
    systemctl enable --now rspamd; log "Rspamd configured"
}

setup_clamav() {
    log "Configuring ClamAV..."
    cp "${PROJECT_DIR}/config/clamav/clamd.conf" /etc/clamav/clamd.conf
    cp "${PROJECT_DIR}/config/clamav/freshclam.conf" /etc/clamav/freshclam.conf
    freshclam --quiet 2>/dev/null || warn "Freshclam will retry via cron"
    systemctl enable --now clamav-daemon clamav-freshclam; log "ClamAV configured"
}

setup_opendkim() {
    log "Configuring OpenDKIM..."
    cp "${PROJECT_DIR}/config/opendkim/opendkim.conf" /etc/opendkim/opendkim.conf
    mkdir -p /etc/opendkim/keys/cmp.local
    printf 'cmp._domainkey.cmp.local cmp.local:cmp:/etc/opendkim/keys/cmp.local/cmp.key\n' > /etc/opendkim/KeyTable
    printf '*@cmp.local cmp._domainkey.cmp.local\n' > /etc/opendkim/SigningTable
    printf '127.0.0.1\n::1\nlocalhost\ncmp.local\n' > /etc/opendkim/TrustedHosts
    if [[ ! -f /etc/opendkim/keys/cmp.local/cmp.key ]]; then
        opendkim-genkey -b 2048 -d cmp.local -D /etc/opendkim/keys/cmp.local -s cmp
        chown -R opendkim:opendkim /etc/opendkim/keys
    fi
    systemctl enable --now opendkim; log "OpenDKIM configured"
}

setup_nginx() {
    log "Configuring Nginx..."
    if [[ ! -f /etc/ssl/certs/cmp.pem ]]; then
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout /etc/ssl/private/cmp.key -out /etc/ssl/certs/cmp.pem \
            -subj "/CN=mail.cmp.local/O=CMP Mail Platform" \
            -addext "subjectAltName=DNS:mail.cmp.local,DNS:cmp.local"
        cp /etc/ssl/certs/cmp.pem /etc/ssl/certs/cmp-ca.pem
    fi
    cp "${PROJECT_DIR}/config/nginx/cmp.conf" /etc/nginx/sites-available/cmp.conf
    ln -sf /etc/nginx/sites-available/cmp.conf /etc/nginx/sites-enabled/cmp.conf
    rm -f /etc/nginx/sites-enabled/default
    nginx -t || die "Nginx config test failed"
    systemctl enable --now nginx; log "Nginx configured"
}

setup_python_app() {
    log "Setting up Python virtual environment..."
    python3 -m venv "$CMP_VENV"
    source "${CMP_VENV}/bin/activate"
    pip install --upgrade pip wheel setuptools
    if [[ -f "${PROJECT_DIR}/api/requirements.txt" ]]; then
        pip install -r "${PROJECT_DIR}/api/requirements.txt"
    else
        pip install fastapi "uvicorn[standard]" "sqlalchemy[asyncio]" asyncpg psycopg2-binary \
            "celery[redis]" redis pydantic pydantic-settings "python-jose[cryptography]" \
            "passlib[bcrypt]" python-multipart httpx aiofiles jinja2 dnspython cryptography
    fi
    deactivate; chown -R "$CMP_USER:$CMP_GROUP" "$CMP_VENV"; log "Python environment ready"
}

setup_portal() {
    log "Building Next.js portal..."
    if [[ -f "${PROJECT_DIR}/portal/package.json" ]]; then
        cd "${PROJECT_DIR}/portal"
        npm ci --production 2>/dev/null || npm install; npm run build
        cp -r "${PROJECT_DIR}/portal"/* "${CMP_HOME}/portal/" 2>/dev/null || true
        chown -R "$CMP_USER:$CMP_GROUP" "${CMP_HOME}/portal"
    else warn "Portal source not found - skipping build"; fi
    cd "$PROJECT_DIR"
}

install_systemd() {
    log "Installing systemd services..."
    for svc in "${PROJECT_DIR}"/config/systemd/*.service; do
        [[ -f "$svc" ]] || continue
        cp "$svc" "/etc/systemd/system/$(basename "$svc")"
    done
    systemctl daemon-reload
    cat > /etc/systemd/system/cmp.target <<'TGT'
[Unit]
Description=CMP Mail Platform
Wants=cmp-api.service cmp-portal.service cmp-worker.service cmp-scheduler.service
After=network.target
TGT
    systemctl daemon-reload; log "Systemd services installed"
}

start_services() {
    log "Starting CMP services..."
    systemctl enable --now cmp-api.service cmp-portal.service cmp-worker.service cmp-scheduler.service 2>/dev/null || \
        warn "Some services failed (app code may not be deployed yet)"
}

generate_env() {
    local env_file="${CMP_HOME}/.env"
    [[ -f "$env_file" ]] && { log ".env exists - skipping"; return; }
    log "Generating .env file..."
    openssl rand -hex 32 > /tmp/.cmp_secret_key
    local SECRET_KEY
    SECRET_KEY=$(cat /tmp/.cmp_secret_key)
    rm -f /tmp/.cmp_secret_key
    cat > "$env_file" <<ENVEOF
# CMP Mail Platform Environment Configuration
# Generated by install.sh

# Database
DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=*** Application
SECRET_KEY=*** production
APP_URL=https://mail.cmp.local
PORTAL_URL=https://mail.cmp.local

# Redis
REDIS_URL=redis://127.0.0.1:***@"
ENVEOF
    chown "$CMP_USER:$CMP_GROUP" "$env_file"; chmod 640 "$env_file"
    log ".env generated at $env_file"
}

save_credentials() {
    local cred_file="${PROJECT_DIR}/.credentials"
    openssl rand -base64 32 > /tmp/.cmp_cred_tmp
    cat > "$cred_file" <<CREDS
# CMP Installation Credentials - KEEP THIS FILE SECURE
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Delete this file after noting the passwords

Database User:     ${DB_USER}
Database Password: ${DB_PASSWORD}
Database Name:     ${DB_NAME}
Full .env file:    ${CMP_HOME}/.env
CREDS
    rm -f /tmp/.cmp_cred_tmp
    chmod 600 "$cred_file"; log "Credentials saved to $cred_file"
}

main() {
    echo ""
    echo "=========================================="
    echo "  CMP Mail Platform - Installation"
    echo "=========================================="
    echo ""

    check_root
    check_os

    log "Step 1/13: Installing packages..."
    install_packages

    log "Step 2/13: Creating cmp user..."
    create_user

    log "Step 3/13: Creating directories..."
    create_directories

    log "Step 4/13: Setting up PostgreSQL..."
    setup_postgresql

    log "Step 5/13: Setting up Redis..."
    setup_redis

    log "Step 6/13: Setting up Postfix..."
    setup_postfix

    log "Step 7/13: Setting up Dovecot..."
    setup_dovecot

    log "Step 8/13: Setting up Rspamd..."
    setup_rspamd

    log "Step 9/13: Setting up ClamAV..."
    setup_clamav

    log "Step 10/13: Setting up OpenDKIM..."
    setup_opendkim

    log "Step 11/13: Setting up Nginx..."
    setup_nginx

    log "Step 12/13: Setting up Python environment..."
    setup_python_app

    log "Step 13/13: Setting up portal..."
    setup_portal

    install_systemd
    generate_env
    save_credentials
    start_services

    echo ""
    echo "=========================================="
    echo "  CMP Installation Complete!"
    echo "=========================================="
    echo ""
    echo "  API:    https://mail.cmp.local/api/"
    echo "  Portal: https://mail.cmp.local/"
    echo ""
    echo "  Credentials: ${PROJECT_DIR}/.credentials"
    echo "  Environment: ${CMP_HOME}/.env"
    echo ""
    echo "  Services:"
    systemctl is-active cmp-api.service 2>/dev/null && echo "    cmp-api:     running" || echo "    cmp-api:     stopped"
    systemctl is-active cmp-portal.service 2>/dev/null && echo "    cmp-portal:  running" || echo "    cmp-portal:  stopped"
    systemctl is-active cmp-worker.service 2>/dev/null && echo "    cmp-worker:  running" || echo "    cmp-worker:  stopped"
    systemctl is-active cmp-scheduler.service 2>/dev/null && echo "    cmp-scheduler: running" || echo "    cmp-scheduler: stopped"
    echo ""
    echo "  Run: scripts/health-check.sh to verify"
    echo "=========================================="
}

main "$@"
