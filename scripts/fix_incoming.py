#!/usr/bin/env python3
"""Fix Postfix for incoming mail - add relay_domains from CMP database."""
import os
import subprocess

# Get active domains from database using psql
DB_PASS = ""
with open("/opt/cmp/.env") as f:
    for line in f:
        if line.startswith("DB_PASSWORD="):
            DB_PASS = line.split("=", 1)[1].strip()
            break

# Get domains
result = subprocess.run(
    ["psql", "-h", "127.0.0.1", "-U", "cmp", "-d", "cmp", "-t", "-A",
     "-c", "SELECT domain_name FROM domains WHERE is_active = true"],
    capture_output=True, text=True, env={**os.environ, "PGPASSWORD": DB_PASS}
)

domains = [d.strip() for d in result.stdout.strip().split("\n") if d.strip()]
print(f"Active domains: {domains}")

# Update main.cf
main_cf = "/etc/postfix/main.cf"
with open(main_cf) as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.strip().startswith("relay_domains"):
        continue
    if line.strip().startswith("transport_maps"):
        continue
    new_lines.append(line)

# Add relay_domains and transport_maps
new_lines.append(f"\n# CMP Gateway - Incoming domains\n")
new_lines.append(f"relay_domains = proxy:pgsql:/etc/postfix/pgsql-relay.cf\n")
new_lines.append(f"transport_maps = proxy:pgsql:/etc/postfix/pgsql-transport.cf\n")

with open(main_cf, "w") as f:
    f.writelines(new_lines)

# Update pgsql-relay.cf
with open("/etc/postfix/pgsql-relay.cf", "w") as f:
    f.write(f"""# CMP - Relay domains query
hosts = 127.0.0.1:5432
user = cmp
password = {DB_PASS}
dbname = cmp
query = SELECT domain_name FROM domains WHERE domain_name = '%s' AND is_active = true
""")

# Update pgsql-transport.cf
with open("/etc/postfix/pgsql-transport.cf", "w") as f:
    f.write(f"""# CMP - Transport map query
hosts = 127.0.0.1:5432
user = cmp
password = {DB_PASS}
dbname = cmp
query = SELECT 'smtp' FROM domains WHERE domain_name = '%s' AND is_active = true
""")

# Set permissions
os.chmod("/etc/postfix/pgsql-relay.cf", 0o640)
os.chmod("/etc/postfix/pgsql-transport.cf", 0o640)
os.system("chown root:postfix /etc/postfix/pgsql-relay.cf /etc/postfix/pgsql-transport.cf")

# Reload Postfix
os.system("postfix reload")

print(f"Updated relay_domains to query CMP database")
print(f"Postfix now accepts mail for: {domains}")
