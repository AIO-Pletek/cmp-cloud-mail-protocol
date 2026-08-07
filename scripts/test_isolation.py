import httpx
BASE = 'https://mailprotocol.cbncloud.net/api/v1'
r = httpx.post(f'{BASE}/auth/login', json={'email':'admin@cbncloud.net','password':'Admin123!'}, verify=False)
admin_h = {'Authorization': f'Bearer {r.json()["accessToken"]}'}

# Admin stats
r0 = httpx.get(f'{BASE}/email-logs/stats?days=30', headers=admin_h, verify=False)
print(f'Admin stats: {r0.json().get("total", 0)} total')

# Impersonate tenant
r = httpx.get(f'{BASE}/tenants', headers=admin_h, verify=False)
for t in r.json():
    if t['email'] == 'int-devops@cbncloud.co.id':
        r2 = httpx.post(f'{BASE}/tenants/{t["id"]}/impersonate', headers=admin_h, verify=False)
        data = r2.json()
        h = {'Authorization': f'Bearer {data["accessToken"]}'}

        r3 = httpx.get(f'{BASE}/domains', headers=h, verify=False)
        print(f'Tenant domains: {len(r3.json())}')

        r4 = httpx.get(f'{BASE}/email-logs/stats?days=30', headers=h, verify=False)
        s = r4.json()
        print(f'Tenant stats: {s.get("total", 0)} total')

        r5 = httpx.get(f'{BASE}/email-logs?per_page=5', headers=h, verify=False)
        data = r5.json()
        items = data.get('items', []) if isinstance(data, dict) else []
        print(f'Tenant email logs: {len(items)} entries')
        break
