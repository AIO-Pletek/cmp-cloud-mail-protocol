#!/usr/bin/env python3
"""
Dovecot auth backend that checks credentials against CMP database.
This script is called by Dovecot's checkpassword auth driver.
"""
import sys
import os
import json
import hashlib
import subprocess

# Exit codes for checkpassword protocol
# 0 = success, 1 = failure, 2 = temporary error

API_KEYS_FILE = "/etc/cmp/api_keys.json"
RELAY_CREDS_FILE = "/etc/cmp/sasl_relay_auth.json"
CMP_USERS_FILE = "/etc/cmp/cmp_users.json"


def verify_credentials(username: str, password: str) -> bool:
    """Verify credentials against CMP stored credentials."""
    
    # 1. Check if it's an API key (format: cmp_relay_xxxxx)
    if password.startswith('cmp_relay_'):
        return check_api_key(password)
    
    # 2. Check CMP SMTP auth credentials
    return check_smtp_credentials(username, password)


def check_api_key(api_key: str) -> bool:
    """Check API key against stored keys."""
    try:
        if not os.path.exists(API_KEYS_FILE):
            return False
        
        with open(API_KEYS_FILE) as f:
            keys = json.load(f)
        
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        for key in keys:
            if key.get("key_hash") == key_hash and key.get("enabled", True):
                # Update usage
                from datetime import datetime
                key["last_used"] = datetime.utcnow().isoformat()
                key["usage_count"] = key.get("usage_count", 0) + 1
                with open(API_KEYS_FILE, 'w') as f:
                    json.dump(keys, f, indent=2)
                return True
        
        return False
    except Exception:
        return False


def check_smtp_credentials(username: str, password: str) -> bool:
    """Check SMTP auth credentials."""
    try:
        if not os.path.exists(RELAY_CREDS_FILE):
            return False
        
        with open(RELAY_CREDS_FILE) as f:
            db = json.load(f)
        
        for cred in db.get("credentials", []):
            if cred.get("username") == username and cred.get("enabled", True):
                # Check password (plain or hash)
                stored_password = cred.get("password", "")
                stored_hash = cred.get("password_hash", "")
                input_hash = hashlib.sha256(password.encode()).hexdigest()
                
                if password == stored_password or input_hash == stored_hash:
                    # Update usage
                    from datetime import datetime
                    cred["last_used"] = datetime.utcnow().isoformat()
                    cred["usage_count"] = cred.get("usage_count", 0) + 1
                    with open(RELAY_CREDS_FILE, 'w') as f:
                        json.dump(db, f, indent=2)
                    return True
        
        return False
    except Exception:
        return False


def main():
    """Main entry point for checkpassword protocol."""
    # Read credentials from file descriptor 3 (checkpassword protocol)
    # Format: username\0password\0timestamp\0
    try:
        fd = 3
        data = os.read(fd, 1024).decode()
        os.close(fd)
        
        parts = data.split('\0')
        if len(parts) < 2:
            sys.exit(1)
        
        username = parts[0]
        password = parts[1]
        
        if verify_credentials(username, password):
            # Set environment variables for Dovecot
            os.environ['USER'] = username
            os.environ['HOME'] = f'/var/mail/vhosts/cmp/{username}'
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        sys.exit(2)


if __name__ == '__main__':
    main()
