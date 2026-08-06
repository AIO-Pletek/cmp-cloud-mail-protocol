#!/usr/bin/env python3
import httpx

BASE = "https://mailprotocol.cbncloud.net/api/v1"

r = httpx.post(f"{BASE}/auth/login", json={"email":"admin@cbncloud.net","password":"Admin123!"}, verify=False)
token = r.json()["accessToken"]
h = {"Authorization": f"Bearer {token}"}

print("=== Domain API Test ===")
endpoints = [
    ("GET", "/domains"),
    ("POST", "/domains", {"domainName": "example2.com"}),
]
for ep in endpoints:
    if ep[0] == "GET":
        r = httpx.get(f"{BASE}{ep[1]}", headers=h, verify=False)
    else:
        r = httpx.post(f"{BASE}{ep[1]}", json=ep[2], headers=h, verify=False)
    mark = "OK" if r.status_code in [200, 201] else "FAIL"
    print(f"  [{mark}] {ep[0]} {ep[1]:20s} -> {r.status_code} {r.text[:120]}")

print("\n=== Filter API Test ===")
r = httpx.get(f"{BASE}/filters", headers=h, verify=False)
print(f"  [OK] GET /filters -> {r.status_code} {r.text[:100]}")

print("\n=== All Dashboard Endpoints ===")
for ep in ["/auth/me", "/domains", "/filters", "/quarantine", "/quarantine/stats", "/reports/traffic", "/queue", "/queue/stats"]:
    r = httpx.get(f"{BASE}{ep}", headers=h, verify=False)
    mark = "OK" if r.status_code == 200 else "FAIL"
    print(f"  [{mark}] {ep:30s} {r.status_code}")
