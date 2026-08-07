#!/usr/bin/env python3
"""Fix domain verification - auto-verify domains with all green DNS."""
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"
r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

# Check domains
r = httpx.get(f"{BASE}/domains", headers=h, verify=False)
domains = r.json()
print(f"Domains: {len(domains)}")
for d in domains:
    print(f"  {d.get('domainName')}: verified={d.get('isVerified')}")

# If empty, the domain might have wrong tenant_id
# Let's check what happens when we try to create
r = httpx.post(f"{BASE}/domains", headers=h, json={"domainName": "plesk.rodahitam.my.id"}, verify=False)
print(f"\nCreate attempt: {r.status_code}")
if r.status_code == 409:
    print("Domain exists but not visible to this tenant - need to fix tenant_id in DB")

# Try verify endpoint directly
# First get domain ID from the 409 response or from another source
print("\nTo fix: UPDATE domains SET tenant_id = (SELECT id FROM tenants WHERE email = 'admin@cbncloud.net') WHERE domain_name = 'plesk.rodahitam.my.id';")
