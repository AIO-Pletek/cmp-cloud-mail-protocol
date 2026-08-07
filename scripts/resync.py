#!/usr/bin/env python3
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"
r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

# Sync (will add new entries with sender data)
r = httpx.post(f"{BASE}/email-logs/sync", headers=h, verify=False)
print(f"Sync: {r.json()}")

# Check results
r = httpx.get(f"{BASE}/email-logs?per_page=10", headers=h, verify=False)
data = r.json()
print(f"Total: {data['total']} entries")
for item in data["items"][:10]:
    sender = item["sender"] or "(empty)"
    print(f"  from={sender:40s} to={item['recipient']:30s} status={item['status']}")
