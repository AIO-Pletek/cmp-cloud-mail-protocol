#!/bin/bash
set -e
echo '=== Building CMP Portal ==='
cd /opt/cmp/portal
npm run build

echo '=== Syncing standalone static assets ==='
mkdir -p /opt/cmp/portal/.next/standalone/.next
cp -r /opt/cmp/portal/.next/static /opt/cmp/portal/.next/standalone/.next/static
if [ -d /opt/cmp/portal/public ]; then
    cp -r /opt/cmp/portal/public /opt/cmp/portal/.next/standalone/public
fi

echo '=== Restarting portal ==='
systemctl restart cmp-portal
sleep 2
systemctl is-active cmp-portal
echo '=== Deploy done ==='
