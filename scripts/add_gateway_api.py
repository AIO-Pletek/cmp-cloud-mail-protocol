#!/usr/bin/env python3
"""Add gateway API methods to api.ts."""
with open('/opt/cmp/portal/src/lib/api.ts', 'r') as f:
    content = f.read()

if 'gateway:' not in content:
    # Add before "export default api;"
    old = "};\n\nexport default api;"
    new = """  gateway: {
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
};

export default api;"""
    content = content.replace(old, new)
    with open('/opt/cmp/portal/src/lib/api.ts', 'w') as f:
        f.write(content)
    print('api.ts updated')
else:
    print('already has gateway')
