#!/usr/bin/env python3
"""Add relay API methods to api.ts."""
with open('/opt/cmp/portal/src/lib/api.ts', 'r') as f:
    lines = f.readlines()

# Find the line with "deleteAll" and add relay after the closing of queue block
new_lines = []
i = 0
while i < len(lines):
    new_lines.append(lines[i])
    # After the deleteAll line, add relay block
    if "deleteAll:" in lines[i] and "queue" in lines[i]:
        # Skip the next two lines ( }, and }; )
        i += 1
        new_lines.append(lines[i])  #   },
        i += 1
        # Now add relay before the };
        relay_lines = [
            "  relay: {\n",
            "    config: () => api.get('/relay').then((r) => r.data),\n",
            "    update: (data: any) => api.put('/relay', data).then((r) => r.data),\n",
            "    addDomain: (data: any) => api.post('/relay/domain', data).then((r) => r.data),\n",
            "    removeDomain: (domain: string) => api.delete('/relay/domain/' + domain).then((r) => r.data),\n",
            "    test: (data: any) => api.post('/relay/test', data).then((r) => r.data),\n",
            "    logs: () => api.get('/relay/logs').then((r) => r.data),\n",
            "  },\n",
        ]
        new_lines.extend(relay_lines)
        new_lines.append(lines[i])  # };
    i += 1

with open('/opt/cmp/portal/src/lib/api.ts', 'w') as f:
    f.writelines(new_lines)
print('Relay methods added!')
