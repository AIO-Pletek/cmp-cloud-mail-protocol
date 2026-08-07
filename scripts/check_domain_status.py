#!/usr/bin/env python3
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"
r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

# Get domains
r = httpx.get(f"{BASE}/domains", headers=h, verify=False)
domains = r.json()

for d in domains:
    print(f"Domain: {d['domain_name']}")
    print(f"  is_verified: {d['is_verified']}")
    print(f"  is_active: {d['is_active']}")
    print(f"  dkim_selector: {d['dkim_selector']}")
    print()
