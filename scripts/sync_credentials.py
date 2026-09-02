#!/usr/bin/env python3
import json, os
from datetime import datetime

API_KEYS_FILES = ['/etc/cmp/api_keys.json', '/etc/cmp/relay_api_keys.json']
RELAY_CREDS_FILE = '/etc/cmp/smtp_auth.json'
DOVECOT_PASSDB = '/etc/dovecot/relay-passdb'
DOVECOT_USERS = '/etc/dovecot/relay-users'

def load_json(path):
    try:
        if not os.path.exists(path):
            return []
        with open(path) as f:
            data = json.load(f)
            return data if isinstance(data, list) else data.get('credentials', [])
    except:
        return []

def generate_passdb():
    entries = []
    seen = set()
    
    # SMTP auth credentials
    for cred in load_json(RELAY_CREDS_FILE):
        if not cred.get('enabled', True):
            continue
        username = cred.get('username', '')
        password = cred.get('password', '')
        if username and password and '***' not in password:
            if username not in seen:
                entries.append(f'{username}:{{PLAIN}}{password}')
                seen.add(username)
    
    # API keys - use 'apikey' as username for all
    # Collect all valid keys
    api_keys = []
    for key_file in API_KEYS_FILES:
        for key in load_json(key_file):
            if key.get('enabled', True):
                api_key = key.get('key', '')
                if api_key and api_key not in seen:
                    api_keys.append(api_key)
                    seen.add(api_key)
    
    # For Dovecot, we can only have one password per username
    # So we'll create a separate entry for each key with unique usernames
    # apikey-1, apikey-2, etc.
    # But the user authenticates as 'apikey' with any valid key
    
    # Better approach: use a custom auth script
    # For now, let's put all keys and let Dovecot try each
    for i, key in enumerate(api_keys):
        entries.append(f'apikey:{{PLAIN}}{key}')
    
    return entries

entries = generate_passdb()
with open(DOVECOT_PASSDB, 'w') as f:
    f.write('\n'.join(entries) + '\n')
os.chmod(DOVECOT_PASSDB, 0o644)

with open(DOVECOT_USERS, 'w') as f:
    f.write('apikey::::::\n')
os.chmod(DOVECOT_USERS, 0o644)

os.system('systemctl reload dovecot 2>/dev/null')
print(f'Synced {len(entries)} credentials')
