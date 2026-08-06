#!/usr/bin/env python3
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"
r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

# Init
r = httpx.post(f"{BASE}/email-logs/init", headers=h, verify=False)
print(f"Init: {r.json()}")

# Sync with detailed error handling
r = httpx.post(f"{BASE}/email-logs/sync", headers=h, verify=False)
print(f"Sync status: {r.status_code}")
print(f"Sync response: {r.text[:200]}")

# Get stats
r = httpx.get(f"{BASE}/email-logs/stats?days=30", headers=h, verify=False)
print(f"Stats: {r.json()}")
