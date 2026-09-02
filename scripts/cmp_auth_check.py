#!/usr/bin/env python3
import sys, os, json, hashlib

API_KEY_FILES=['/etc/cmp/api_keys.json', '/etc/cmp/relay_api_keys.json']
CREDS_FILE = '/etc/cmp/smtp_auth.json'

def check(username, password):
    # Check API keys
    if password.startswith('cmp_relay_'):
        for f in API_KEY_FILES:
            try:
                if not os.path.exists(f):
                    continue
                with open(f) as fh:
                    for k in json.load(fh):
                        if k.get('enabled') and k.get('key') == password:
                            return True
            except:
                pass
        return False
    
    # Check SMTP credentials
    try:
        if os.path.exists(CREDS_FILE):
            with open(CREDS_FILE) as fh:
                data = json.load(fh)
                for c in data.get('credentials', []):
                    if c.get('username') == username and c.get('enabled'):
                        if c.get('password') == password:
                            return True
                        h = hashlib.sha256(password.encode()).hexdigest()
                        if c.get('password_hash') == h:
                            return True
    except:
        pass
    return False

if __name__ == '__main__':
    # checkpassword protocol: read from fd 3
    try:
        data = os.read(3, 4096).decode()
        os.close(3)
        parts = data.split('\0')
        if len(parts) >= 2 and check(parts[0], parts[1]):
            os.environ['USER'] = parts[0]
            os.environ['HOME'] = '/tmp'
            sys.exit(0)
    except:
        pass
    sys.exit(1)
