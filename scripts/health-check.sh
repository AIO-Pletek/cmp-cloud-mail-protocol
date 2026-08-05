#!/usr/bin/env bash
# CMP Mail Platform - Health Check Script
set -euo pipefail

CMP_HOME="/opt/cmp"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

PASS=0
WARN=0
FAIL=0

check_pass() { echo -e "  ${GREEN}PASS${NC}  $*"; ((PASS++)); }
check_warn() { echo -e "  ${YELLOW}WARN${NC}  $*"; ((WARN++)); }
check_fail() { echo -e "  ${RED}FAIL${NC}  $*"; ((FAIL++)); }

check_service() {
    local name="$1"
    if systemctl is-active --quiet "$name" 2>/dev/null; then
        check_pass "$name is running"
    elif systemctl is-enabled --quiet "$name" 2>/dev/null; then
        check_warn "$name is enabled but not running"
    else
        check_fail "$name is not running"
    fi
}

check_port() {
    local port="$1" name="$2"
    if ss -tlnp | grep -q ":${port} " 2>/dev/null; then
        check_pass "$name listening on port $port"
    else
        check_fail "$name NOT listening on port $port"
    fi
}

check_file() {
    local path="$1" name="$2" perms="${3:-}"
    if [[ -f "$path" ]]; then
        if [[ -n "$perms" ]]; then
            local actual
            actual=$(stat -c '%a' "$path" 2>/dev/null)
            if [[ "$actual" == "$perms" ]]; then
                check_pass "$name exists (perms: $actual)"
            else
                check_warn "$name exists but perms are $actual (expected $perms)"
            fi
        else
            check_pass "$name exists"
        fi
    else
        check_fail "$name missing: $path"
    fi
}

check_url() {
    local url="$1" name="$2"
    local code
    code=$(curl -sk -o /dev/null -w '%{http_code}' --connect-timeout 5 "$url" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^[23] ]]; then
        check_pass "$name responds (HTTP $code)"
    elif [[ "$code" == "000" ]]; then
        check_fail "$name unreachable ($url)"
    else
        check_warn "$name returned HTTP $code"
    fi
}

echo ""
echo "=========================================="
echo "  CMP Mail Platform - Health Check"
echo "=========================================="
echo ""

# ── System Services ──────────────────────────────────────────────────
echo "--- System Services ---"
check_service postgresql
check_service redis-server
check_service nginx
check_service postfix
check_service dovecot
check_service rspamd
check_service clamav-daemon
check_service clamav-freshclam
check_service opendkim
echo ""

# ── CMP Services ─────────────────────────────────────────────────────
echo "--- CMP Application Services ---"
check_service cmp-api.service
check_service cmp-portal.service
check_service cmp-worker.service
check_service cmp-scheduler.service
echo ""

# ── Network Ports ────────────────────────────────────────────────────
echo "--- Network Ports ---"
check_port 25 "SMTP"
check_port 465 "SMTPS"
check_port 587 "Submission"
check_port 993 "IMAPS"
check_port 80 "HTTP (Nginx)"
check_port 443 "HTTPS (Nginx)"
check_port 8000 "CMP API"
check_port 3000 "CMP Portal"
check_port 11332 "Rspamd milter"
check_port 11334 "Rspamd controller"
check_port 3310 "ClamAV"
check_port 6379 "Redis"
check_port 5432 "PostgreSQL"
echo ""

# ── Configuration Files ──────────────────────────────────────────────
echo "--- Configuration Files ---"
check_file /etc/postfix/main.cf "Postfix main.cf"
check_file /etc/postfix/pgsql-virtual.cf "Postfix pgsql-virtual.cf" "640"
check_file /etc/postfix/pgsql-mailbox.cf "Postfix pgsql-mailbox.cf" "640"
check_file /etc/dovecot/dovecot.conf "Dovecot config"
check_file /etc/dovecot/dovecot-sql.conf.ext "Dovecot SQL config" "600"
check_file /etc/rspamd/rspamd.conf "Rspamd config"
check_file /etc/nginx/sites-available/cmp.conf "Nginx CMP config"
check_file /etc/ssl/certs/cmp.pem "TLS certificate"
check_file /etc/ssl/private/cmp.key "TLS private key" "600"
check_file "${CMP_HOME}/.env" "CMP environment file" "640"
echo ""

# ── SSL Certificate ──────────────────────────────────────────────────
echo "--- SSL Certificate ---"
if [[ -f /etc/ssl/certs/cmp.pem ]]; then
    local_expiry=$(openssl x509 -in /etc/ssl/certs/cmp.pem -noout -enddate 2>/dev/null | cut -d= -f2)
    local_days_left=$(( ( $(date -d "$local_expiry" +%s) - $(date +%s) ) / 86400 ))
    if [[ $local_days_left -gt 30 ]]; then
        check_pass "Certificate valid for $local_days_left days (expires: $local_expiry)"
    elif [[ $local_days_left -gt 0 ]]; then
        check_warn "Certificate expires in $local_days_left days - renew soon"
    else
        check_fail "Certificate expired!"
    fi
else
    check_fail "Certificate file not found"
fi
echo ""

# ── HTTP Endpoints ───────────────────────────────────────────────────
echo "--- HTTP Endpoints ---"
check_url "https://127.0.0.1/health" "Nginx health endpoint"
check_url "http://127.0.0.1:8000/api/health" "CMP API health"
check_url "http://127.0.0.1:3000" "CMP Portal"
echo ""

# ── Database ─────────────────────────────────────────────────────────
echo "--- Database ---"
if sudo -u postgres psql -c "SELECT 1" &>/dev/null; then
    check_pass "PostgreSQL accepting connections"
    DB_COUNT=$(sudo -u postgres psql -t -c "SELECT count(*) FROM pg_database WHERE datname='cmp'" 2>/dev/null | tr -d ' ')
    if [[ "$DB_COUNT" == "1" ]]; then
        check_pass "CMP database exists"
    else
        check_fail "CMP database not found"
    fi
else
    check_fail "PostgreSQL not accepting connections"
fi
echo ""

# ── Disk Space ───────────────────────────────────────────────────────
echo "--- Disk Space ---"
ROOT_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [[ $ROOT_USAGE -lt 80 ]]; then
    check_pass "Root partition: ${ROOT_USAGE}% used"
elif [[ $ROOT_USAGE -lt 90 ]]; then
    check_warn "Root partition: ${ROOT_USAGE}% used (getting full)"
else
    check_fail "Root partition: ${ROOT_USAGE}% used (critically full)"
fi

if [[ -d /var/mail ]]; then
    MAIL_SIZE=$(du -sh /var/mail 2>/dev/null | cut -f1)
    check_pass "Mail directory size: $MAIL_SIZE"
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────
echo "=========================================="
echo "  Results: ${GREEN}${PASS} passed${NC}, ${YELLOW}${WARN} warnings${NC}, ${RED}${FAIL} failed${NC}"
echo "=========================================="
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "  Health check FAILED - review failures above"
    exit 1
elif [[ $WARN -gt 0 ]]; then
    echo "  Health check PASSED with warnings"
    exit 0
else
    echo "  All checks PASSED"
    exit 0
fi
