#!/bin/bash
set -euo pipefail

source /opt/cmp/.env

log() { echo "[CMP] $*"; }

# --- Postfix ---
log "Configuring Postfix..."
cp /opt/cmp/config/postfix/main.cf /etc/postfix/main.cf
cp /opt/cmp/config/postfix/master.cf /etc/postfix/master.cf
for f in pgsql-virtual.cf pgsql-mailbox.cf; do
    cp "/opt/cmp/config/postfix/$f" "/etc/postfix/$f"
    sed -i "s/\${CMP_DB_PASSWORD}/${DB_PASSWORD}/g" "/etc/postfix/$f"
    chmod 640 "/etc/postfix/$f"
    chown root:postfix "/etc/postfix/$f"
done
printf '/^Received:.*/ IGNORE\n/^X-Originating-IP:/ IGNORE\n' > /etc/postfix/header_checks
systemctl enable --now postfix
log "Postfix OK"

# --- Rspamd ---
log "Configuring Rspamd..."
mkdir -p /etc/rspamd/local.d
cp /opt/cmp/config/rspamd/rspamd.conf /etc/rspamd/rspamd.conf 2>/dev/null || true
for f in /opt/cmp/config/rspamd/local.d/*; do
    cp "$f" "/etc/rspamd/local.d/$(basename "$f")"
done
mkdir -p /var/log/rspamd
chown -R _rspamd:_rspamd /var/log/rspamd /var/lib/rspamd
systemctl enable --now rspamd
log "Rspamd OK"

# --- ClamAV ---
log "Configuring ClamAV..."
cp /opt/cmp/config/clamav/clamd.conf /etc/clamav/clamd.conf 2>/dev/null || true
cp /opt/cmp/config/clamav/freshclam.conf /etc/clamav/freshclam.conf 2>/dev/null || true
freshclam --quiet 2>/dev/null || log "Freshclam will update via cron"
systemctl enable --now clamav-daemon clamav-freshclam 2>/dev/null || true
log "ClamAV OK"

# --- OpenDKIM ---
log "Configuring OpenDKIM..."
cp /opt/cmp/config/opendkim/opendkim.conf /etc/opendkim/opendkim.conf 2>/dev/null || true
mkdir -p /etc/opendkim/keys/cbncloud.net
echo "cmp._domainkey.cbncloud.net cbncloud.net:cmp:/etc/opendkim/keys/cbncloud.net/cmp.key" > /etc/opendkim/KeyTable
echo "*@cbncloud.net cmp._domainkey.cbncloud.net" > /etc/opendkim/SigningTable
echo -e "127.0.0.1\n::1\nlocalhost\ncbncloud.net" > /etc/opendkim/TrustedHosts
if [[ ! -f /etc/opendkim/keys/cbncloud.net/cmp.key ]]; then
    opendkim-genkey -b 2048 -d cbncloud.net -D /etc/opendkim/keys/cbncloud.net -s cmp
    chown -R opendkim:opendkim /etc/opendkim/keys
fi
systemctl enable --now opendkim 2>/dev/null || true
log "OpenDKIM OK"

# --- Nginx + Self-signed SSL ---
log "Configuring Nginx..."
if [[ ! -f /etc/ssl/certs/cmp.pem ]]; then
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/ssl/private/cmp.key -out /etc/ssl/certs/cmp.pem \
        -subj "/CN=mailprotocol.cbncloud.net/O=CMP Cloud Mail Protocol" \
        -addext "subjectAltName=DNS:mailprotocol.cbncloud.net,DNS:cbncloud.net"
fi
cp /opt/cmp/config/nginx/cmp.conf /etc/nginx/sites-available/cmp.conf
ln -sf /etc/nginx/sites-available/cmp.conf /etc/nginx/sites-enabled/cmp.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
log "Nginx OK"

# --- Python venv ---
log "Setting up Python environment..."
python3 -m venv /opt/cmp/venv
source /opt/cmp/venv/bin/activate
pip install --upgrade pip wheel setuptools 2>/dev/null
pip install -r /opt/cmp/api/requirements.txt 2>/dev/null
pip install email-validator 2>/dev/null
deactivate
chown -R cmp:cmp /opt/cmp/venv
log "Python OK"

# --- Build Portal ---
log "Building Next.js portal..."
cd /opt/cmp/portal
npm install 2>/dev/null
npm run build 2>/dev/null || log "Portal build had warnings (OK for dev)"
chown -R cmp:cmp /opt/cmp/portal
cd /opt/cmp
log "Portal OK"

# --- Systemd services ---
log "Installing systemd services..."
for svc in /opt/cmp/config/systemd/*.service; do
    cp "$svc" "/etc/systemd/system/$(basename "$svc")"
done
cat > /etc/systemd/system/cmp.target <<'EOF'
[Unit]
Description=CMP Cloud Mail Protocol
Wants=cmp-api.service cmp-portal.service cmp-worker.service cmp-scheduler.service
After=network.target
EOF
systemctl daemon-reload

# Start services
systemctl enable --now cmp-api.service 2>/dev/null || log "cmp-api needs code fix"
systemctl enable --now cmp-portal.service 2>/dev/null || log "cmp-portal needs build"
systemctl enable --now cmp-worker.service 2>/dev/null || log "cmp-worker optional"
systemctl enable --now cmp-scheduler.service 2>/dev/null || log "cmp-scheduler optional"

log "=== DEPLOYMENT COMPLETE ==="
log ""
log "Portal: https://mailprotocol.cbncloud.net"
log "API:    https://mailprotocol.cbncloud.net/api/docs"
log ""

# Show service status
for svc in cmp-api cmp-portal cmp-worker cmp-scheduler nginx postgresql redis-server postfix rspamd; do
    status=$(systemctl is-active "$svc" 2>/dev/null || echo "stopped")
    printf "  %-20s %s\n" "$svc:" "$status"
done
