#!/usr/bin/env python3
"""Add gateway API methods and sidebar item."""

# Add to api.ts
with open('/opt/cmp/portal/src/lib/api.ts', 'r') as f:
    content = f.read()

if 'gateway:' not in content:
    old = "    logs: () => api.get('/relay/logs').then((r) => r.data),\n  },\n};"
    new = """    logs: () => api.get('/relay/logs').then((r) => r.data),
  },
  gateway: {
    config: () => api.get('/gateway/config').then((r) => r.data),
    updateConfig: (data: any) => api.put('/gateway/config', data).then((r) => r.data),
    trustedHosts: () => api.get('/gateway/trusted-hosts').then((r) => r.data),
    addTrustedHost: (data: any) => api.post('/gateway/trusted-hosts', data).then((r) => r.data),
    removeTrustedHost: (address: string) => api.delete('/gateway/trusted-hosts/' + encodeURIComponent(address)).then((r) => r.data),
    apiKeys: () => api.get('/gateway/api-keys').then((r) => r.data),
    createApiKey: (data: any) => api.post('/gateway/api-keys', data).then((r) => r.data),
    revokeApiKey: (keyId: string) => api.delete('/gateway/api-keys/' + keyId).then((r) => r.data),
    rateLimits: () => api.get('/gateway/rate-limits').then((r) => r.data),
    updateRateLimits: (data: any) => api.put('/gateway/rate-limits', data).then((r) => r.data),
  },
};"""
    content = content.replace(old, new)
    with open('/opt/cmp/portal/src/lib/api.ts', 'w') as f:
        f.write(content)
    print('api.ts updated')

# Add sidebar
with open('/opt/cmp/portal/src/components/layout/sidebar.tsx', 'r') as f:
    content = f.read()

if '/gateway' not in content:
    content = content.replace(
        "  { href: '/trusted-hosts', label: 'Trusted Hosts', icon: ShieldCheck },",
        "  { href: '/trusted-hosts', label: 'Trusted Hosts', icon: ShieldCheck },\n  { href: '/gateway', label: 'Enterprise Gateway', icon: ShieldAlert },"
    )
    if 'ShieldAlert' not in content:
        content = content.replace(
            "  ShieldCheck,\n} from",
            "  ShieldCheck,\n  ShieldAlert,\n} from"
        )
    with open('/opt/cmp/portal/src/components/layout/sidebar.tsx', 'w') as f:
        f.write(content)
    print('sidebar updated')
