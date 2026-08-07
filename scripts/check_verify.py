#!/usr/bin/env python3
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"
r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

# Get domains
r = httpx.get(f"{BASE}/domains", headers=h, verify=False)
print(f"Domains API status: {r.status_code}")
print(f"Domains count: {len(r.json())}")

domains = r.json()
for d in domains:
    print(f"\nDomain: {d.get('domain_name')}")
    print(f"  is_verified: {d.get('is_verified')}")
    print(f"  is_active: {d.get('is_active')}")
    
    # Check DNS
    r2 = httpx.get(f"{BASE}/domains/{d['id']}/dns-check", headers=h, verify=False)
    if r2.status_code == 200:
        dns = r2.json()
        print(f"  DNS: mx={dns.get('mx_ok')}, spf={dns.get('spf_ok')}, dkim={dns.get('dkim_ok')}, dmarc={dns.get('dmarc_ok')}")
    else:
        print(f"  DNS check: {r2.status_code}")
