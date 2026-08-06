#!/usr/bin/env python3
"""Add relay API methods to api.ts."""
with open('/opt/cmp/portal/src/lib/api.ts', 'r') as f:
    content = f.read()

if 'relay:' not in content:
    # Find the end of cmpApi object and add relay methods
    # Look for the last occurrence of tenants branding
    marker = "      }).then((r) => r.data),\n  },\n};"
    if marker in content:
        relay_block = """      }).then((r) => r.data),
  },
  relay: {
    config: () => api.get('/relay').then((r) => r.data),
    update: (data: any) => api.put('/relay', data).then((r) => r.data),
    addDomain: (data: any) => api.post('/relay/domain', data).then((r) => r.data),
    removeDomain: (domain: string) => api.delete('/relay/domain/' + domain).then((r) => r.data),
    test: (data: any) => api.post('/relay/test', data).then((r) => r.data),
    logs: () => api.get('/relay/logs').then((r) => r.data),
  },
};"""
        content = content.replace(marker, relay_block)

with open('/opt/cmp/portal/src/lib/api.ts', 'w') as f:
    f.write(content)
print('Relay methods added!')
