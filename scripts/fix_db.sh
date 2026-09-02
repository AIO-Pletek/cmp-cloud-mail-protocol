#!/bin/bash
# Fix DB password and restart API
DB_PASS=$(python3 -c "
import os
for line in open('/opt/cmp/.env'):
    if line.startswith('DB_PASSWORD='):
        print(line.split('=', 1)[1].strip())
        break
")

sudo -u postgres psql -c "ALTER USER cmp WITH PASSWORD '${DB_PASS}';"
echo "DB password synced"

systemctl restart cmp-api
sleep 3

# Test
curl -s http://127.0.0.1:8000/health
echo ""

# Enable all services
systemctl enable cmp-api cmp-portal 2>/dev/null

# Final status
for svc in cmp-api cmp-portal nginx postgresql redis-server postfix rspamd; do
    status=$(systemctl is-active $svc 2>/dev/null || echo 'inactive')
    printf "  %-20s %s\n" "$svc:" "$status"
done

echo ""
echo "=== External Access ==="
curl -sk -o /dev/null -w 'HTTPS Portal: %{http_code}\n' https://mailprotocol.cbncloud.net
curl -sk -o /dev/null -w 'HTTPS API docs: %{http_code}\n' https://mailprotocol.cbncloud.net/api/docs
