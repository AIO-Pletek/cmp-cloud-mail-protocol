#!/usr/bin/env python3
with open('/opt/cmp/api/cmp/services/email_log_service.py', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'SELECT * FROM email_logs WHERE' in line and 'LIMIT' in line and 'OFFSET' in line:
        # Rewrite the query line to use proper parameter binding
        new_lines.append('    query = f"SELECT * FROM email_logs WHERE {where} ORDER BY timestamp DESC LIMIT ${{idx}} OFFSET ${{idx + 1}}"\n')
        new_lines.append('    rows = await conn.fetch(query, *params, per_page, offset)\n')
    else:
        new_lines.append(line)

with open('/opt/cmp/api/cmp/services/email_log_service.py', 'w') as f:
    f.writelines(new_lines)
print('Fixed SQL query')
