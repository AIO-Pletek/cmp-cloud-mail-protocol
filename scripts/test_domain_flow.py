#!/usr/bin/env python3
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"

r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

# Create a test domain
print("=== Create Domain ===")
r = httpx.post(f"{BASE}/domains", json={"domainName": "testdomain.com"}, headers=h, verify=False)
print(f"Status: {r.status_code}")
if r.status_code == 201:
    data = r.json()
    print(f"Domain ID: {data.get('id')}")
    print(f"Domain name field: domain_name={data.get('domain_name')}")
    print(f"DKIM selector: {data.get('dkim_selector')}")
    
    # Now convert to camelCase like the frontend would
    def snake_to_camel(s): return s.replace('_', ' ').title().replace(' ', '').replace(s[0], s[0].lower(), 1) if '_' in s else s
    
    # Verify all key fields exist
    expected = ['id', 'domain_name', 'is_verified', 'dkim_selector', 'is_active', 'email_count', 'spam_blocked']
    for key in expected:
        val = data.get(key, 'MISSING')
        print(f"  {key}: {val}")

# List domains
print("\n=== List Domains ===")
r = httpx.get(f"{BASE}/domains", headers=h, verify=False)
domains = r.json()
print(f"Count: {len(domains)}")
for d in domains:
    print(f"  - {d.get('domain_name')} (verified: {d.get('is_verified')})")
