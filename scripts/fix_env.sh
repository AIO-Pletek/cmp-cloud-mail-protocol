#!/bin/bash
# Fix .env to match what config.py expects (CMP_ prefix)
# config.py uses env_prefix="CMP_" so env vars need CMP_ prefix

DB_PASS=$(grep '^DB_PASSWORD=' /opt/cmp/.env | cut -d= -f2)
SECRET=$(grep '^SECRET_KEY=' /opt/cmp/.env | cut -d= -f2)

# Add CMP_ prefixed vars to .env
cat >> /opt/cmp/.env << EOF

# CMP API Config (with CMP_ prefix for pydantic-settings)
CMP_DB_URL=postgresql+asyncpg://cmp:${DB_PASS}@127.0.0.1:5432/cmp
CMP_REDIS_URL=redis://127.0.0.1:6379/0
CMP_JWT_SECRET=${SECRET}
CMP_JWT_ALGORITHM=HS256
CMP_ACCESS_TOKEN_EXPIRE=30
CMP_REFRESH_TOKEN_EXPIRE=7
EOF

echo "Updated .env with CMP_ prefix vars"

# Restart API
systemctl stop cmp-api
sleep 2
systemctl start cmp-api
sleep 5

# Check
curl -s http://127.0.0.1:8000/health
echo ""

# Status
for svc in cmp-api cmp-portal; do
    status=$(systemctl is-active $svc 2>/dev/null)
    printf "  %-15s %s\n" "$svc:" "$status"
done

echo ""
curl -sk -o /dev/null -w 'Portal: %{http_code}\n' https://mailprotocol.cbncloud.net
curl -sk -o /dev/null -w 'API docs: %{http_code}\n' https://mailprotocol.cbncloud.net/api/docs
