#!/usr/bin/env python3
"""Update sidebar to add relay nav item."""
with open('/opt/cmp/portal/src/components/layout/sidebar.tsx', 'r') as f:
    content = f.read()

# Add Send import if needed
if 'Send' not in content:
    content = content.replace(
        "  List,\n} from 'lucide-react';",
        "  List,\n  Send,\n} from 'lucide-react';"
    )

# Add relay nav item after queue
if '/relay' not in content:
    content = content.replace(
        "  { href: '/queue', label: 'Mail Queue', icon: List },",
        "  { href: '/queue', label: 'Mail Queue', icon: List },\n  { href: '/relay', label: 'Outgoing Relay', icon: Send },"
    )

with open('/opt/cmp/portal/src/components/layout/sidebar.tsx', 'w') as f:
    f.write(content)
print('Sidebar updated!')
