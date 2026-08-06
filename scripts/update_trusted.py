#!/usr/bin/env python3
"""Add trusted-hosts API methods and sidebar item."""
import os

# Add to api.ts
api_path = '/opt/cmp/portal/src/lib/api.ts'
with open(api_path, 'r') as f:
    content = f.read()

if 'trustedHosts:' not in content:
    # Add before the closing };
    old = "    logs: () => api.get('/relay/logs').then((r) => r.data),\n  },\n};"
    new = """    logs: () => api.get('/relay/logs').then((r) => r.data),
  },
  trustedHosts: {
    list: () => api.get('/trusted-hosts').then((r) => r.data),
    stats: () => api.get('/trusted-hosts/stats').then((r) => r.data),
    add: (data: any) => api.post('/trusted-hosts', data).then((r) => r.data),
    remove: (address: string) => api.delete('/trusted-hosts/' + encodeURIComponent(address)).then((r) => r.data),
    toggle: (address: string, enabled: boolean) => api.put('/trusted-hosts/' + encodeURIComponent(address) + '/toggle', { enabled }).then((r) => r.data),
    test: (address: string, port: number = 25) => api.post('/trusted-hosts/test', { address, port }).then((r) => r.data),
  },
};"""
    content = content.replace(old, new)
    with open(api_path, 'w') as f:
        f.write(content)
    print('api.ts updated')
else:
    print('api.ts already has trustedHosts')

# Add sidebar item
sidebar_path = '/opt/cmp/portal/src/components/layout/sidebar.tsx'
with open(sidebar_path, 'r') as f:
    content = f.read()

if '/trusted-hosts' not in content:
    # Add Shield import if not present
    if 'Shield' not in content.split("from 'lucide-react'")[0]:
        content = content.replace(
            "  Send,\n} from 'lucide-react';",
            "  Send,\n  ShieldCheck,\n} from 'lucide-react';"
        )
    
    # Add nav item after relay
    content = content.replace(
        "  { href: '/relay', label: 'Outgoing Relay', icon: Send },",
        "  { href: '/relay', label: 'Outgoing Relay', icon: Send },\n  { href: '/trusted-hosts', label: 'Trusted Hosts', icon: ShieldCheck },"
    )
    with open(sidebar_path, 'w') as f:
        f.write(content)
    print('sidebar updated')
else:
    print('sidebar already has trusted-hosts')
