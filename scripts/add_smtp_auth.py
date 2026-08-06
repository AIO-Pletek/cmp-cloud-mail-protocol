#!/usr/bin/env python3
"""Add SMTP auth routes and API methods."""

# Update main.py
with open('/opt/cmp/api/cmp/main.py', 'r') as f:
    content = f.read()

if 'smtp_auth' not in content:
    content = content.replace(
        'from cmp.routes import auth, tenants, domains, filters, quarantine, reports, queue, relay, trusted_hosts, gateway',
        'from cmp.routes import auth, tenants, domains, filters, quarantine, reports, queue, relay, trusted_hosts, gateway, smtp_auth'
    )
    content = content.replace(
        'app.include_router(gateway.router)',
        'app.include_router(gateway.router)\napp.include_router(smtp_auth.router)'
    )
    with open('/opt/cmp/api/cmp/main.py', 'w') as f:
        f.write(content)
    print('main.py updated')

# Update api.ts
with open('/opt/cmp/portal/src/lib/api.ts', 'r') as f:
    content = f.read()

if 'smtpAuth:' not in content:
    old = "    updateRateLimits: (data: any) => api.put('/gateway/rate-limits', data).then((r) => r.data),\n  },\n};"
    new = """    updateRateLimits: (data: any) => api.put('/gateway/rate-limits', data).then((r) => r.data),
  },
  smtpAuth: {
    credentials: () => api.get('/smtp-auth/credentials').then((r) => r.data),
    createCredential: (data: any) => api.post('/smtp-auth/credentials', data).then((r) => r.data),
    deleteCredential: (id: string) => api.delete('/smtp-auth/credentials/' + id).then((r) => r.data),
    toggleCredential: (id: string, enabled: boolean) => api.put('/smtp-auth/credentials/' + id + '/toggle', { enabled }).then((r) => r.data),
    verify: (data: any) => api.post('/smtp-auth/verify', data).then((r) => r.data),
    instructions: (username: string) => api.get('/smtp-auth/instructions/' + username).then((r) => r.data),
  },
};"""
    content = content.replace(old, new)
    with open('/opt/cmp/portal/src/lib/api.ts', 'w') as f:
        f.write(content)
    print('api.ts updated')
