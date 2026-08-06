#!/usr/bin/env python3
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"
r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

# Init table
r = httpx.post(f"{BASE}/email-logs/init", headers=h, verify=False)
print(f"Init: {r.json()}")

# Sync logs
r = httpx.post(f"{BASE}/email-logs/sync", headers=h, verify=False)
print(f"Sync: {r.json()}")

# Get stats
r = httpx.get(f"{BASE}/email-logs/stats?days=7", headers=h, verify=False)
stats = r.json()
print(f"Stats: total={stats['total']}, incoming={stats['incoming']}, outgoing={stats['outgoing']}")

# Get logs
r = httpx.get(f"{BASE}/email-logs?per_page=5", headers=h, verify=False)
data = r.json()
print(f"Logs: {data['total']} entries")
for item in data["items"][:5]:
    print(f"  {item['direction']:8s} | {item['status']:8s} | {item.get('sender',''):30s} -> {item.get('recipient',''):30s} | {item.get('domain','')}")
