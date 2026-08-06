#!/usr/bin/env python3
import httpx, json

BASE = "https://mailprotocol.cbncloud.net/api/v1"

r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

# Test create domain
print("=== Test Create Domain ===")
r = httpx.post(f"{BASE}/domains", json={"domainName": "test.example.com"}, headers=h, verify=False)
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:500]}")

if r.status_code != 200:
    print("\n=== Check API Logs ===")

# Test list domains
print("\n=== Test List Domains ===")
r = httpx.get(f"{BASE}/domains", headers=h, verify=False)
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:300]}")
