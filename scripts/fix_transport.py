#!/usr/bin/env python3
"""Add destination_relay field to domains table and fix transport."""
import os
import subprocess

DB_PASS = ""
with open("/opt/cmp/.env") as f:
    for line in f:
        if line.startswith("DB_PASSWORD=***            DB_PASS = line.split("=", 1)[1].strip()
            break

# Add destination_relay column
subprocess.run(
    ["psql", "-h", "127.0.0.1", "-U", "cmp", "-d", "cmp", "-c",
     "ALTER TABLE domains ADD COLUMN IF NOT EXISTS destination_relay VARCHAR(255)"],
    env={**os.environ, "PGPASSWORD": DB_PASS}, capture_output=True
)

# Set destination for plesk.rodahitam.my.id
subprocess.run(
    ["psql", "-h", "127.0.0.1", "-U", "cmp", "-d", "cmp", "-c",
     "UPDATE domains SET destination_relay = '116.204.131.86' WHERE domain_name = 'plesk.rodahitam.my.id'"],
    env={**os.environ, "PGPASSWORD": DB_PASS}, capture_output=True
)

print("Added destination_relay column")
print("Set plesk.rodahitam.my.id -> 116.204.131.86")

# Update transport map
transport_query = "SELECT 'smtp:[' || destination_relay || ']:25' FROM domains WHERE domain_name = '%s' AND is_active = true AND destination_relay IS NOT NULL"

with open("/etc/postfix/pgsql-transport.cf", "w") as f:
    f.write("# CMP - Transport map query\n")
    f.write("hosts = 127.0.0.1:5432\n")
    f.write("user = cmp\n")
    f.write(f"password = {DB_PASS}\n")
    f.write("dbname = cmp\n")
    f.write(f"query = {transport_query}\n")

os.chmod("/etc/postfix/pgsql-transport.cf", 0o640)
os.system("chown root:postfix /etc/postfix/pgsql-transport.cf")
os.system("postfix reload")
print("Updated transport map")
