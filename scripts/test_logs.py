#!/usr/bin/env python3
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"
r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

r = httpx.get(f"{BASE}/email-logs?per_page=5", headers=h, verify=False)
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:500]}")
