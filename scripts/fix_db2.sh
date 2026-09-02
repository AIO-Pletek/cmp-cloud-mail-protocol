#!/bin/bash
# Fix DB password auth issue

# Read the password from .env
DB_PASS=$(grep '^DB_PASSWORD=' /opt/cmp/.env | cut -d= -f2)

# Reset PostgreSQL password
sudo -u postgres psql -c "ALTER USER cmp WITH PASSWORD '${DB_PASS}';"

# Verify connection
PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U cmp -d cmp -c "SELECT 1 as test;" 2>&1

# Restart API
systemctl restart cmp-api
sleep 5

# Check
curl -s http://127.0.0.1:8000/health
echo ""

# Final status
echo "=== Services ==="
for svc in cmp-api cmp-portal nginx postgresql redis-server postfix rspamd; do
    status=$(systemctl is-active $svc 2>/dev/null || echo 'inactive')
    printf "  %-20s %s\n" "$svc:" "$status"
done

echo ""
echo "=== External ==="
curl -sk -o /dev/null -w 'Portal: %{http_code}\n' https://mailprotocol.cbncloud.net
curl -sk -o /dev/null -w 'API docs: %{http_code}\n' https://mailprotocol.cbncloud.net/api/docs
