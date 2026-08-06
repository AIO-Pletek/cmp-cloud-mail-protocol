#!/usr/bin/env python3
"""
Sync CMP credentials (API keys + SMTP auth) to Dovecot passdb file.
Run this whenever credentials change in CMP portal.
"""
import json
import os
import sys
from datetime import datetime

API_KEYS_FILE = "/etc/cmp/api_keys.json"
RELAY_CREDS_FILE = "/etc/cmp/sasl_relay_auth.json"
DOVECOT_PASSDB = "/etc/dovecot/relay-passdb"
DOVECOT_USERS = "/etc/dovecot/relay-users"


def load_json_file(path):
    try:
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return json.load(f)
    except Exception:
        return []


def generate_passdb():
    entries = []

    # SMTP auth credentials
    creds_data = load_json_file(RELAY_CREDS_FILE)
    for cred in creds_data.get("credentials", creds_data) if isinstance(creds_data, dict) else creds_data:
        if not cred.get("enabled", True):
            continue
        username = cred.get("username", "")
        password = cred.get("password", "")
        if username and password:
            entries.append(f"{username}:{{PLAIN}}{password}")

    # API keys
    for key in load_json_file(API_KEYS_FILE):
        if not key.get("enabled", True):
            continue
        api_key = key.get("key", "")
        if api_key:
            entries.append(f"apikey:{{PLAIN}}{api_key}")

    return entries


def main():
    entries = generate_passdb()

    with open(DOVECOT_PASSDB, "w") as f:
        f.write("\n".join(entries) + "\n" if entries else "")
    os.chmod(DOVECOT_PASSDB, 0o644)

    with open(DOVECOT_USERS, "w") as f:
        for entry in entries:
            f.write(f"{entry.split(':')[0]}::::::\n")
    os.chmod(DOVECOT_USERS, 0o644)

    os.system("doveadm reload 2>/dev/null || systemctl reload dovecot 2>/dev/null")
    print(f"Synced {len(entries)} credentials at {datetime.now().isoformat()}")


if __name__ == "__main__":
    main()
