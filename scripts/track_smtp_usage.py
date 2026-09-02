#!/usr/bin/env python3
"""Track SMTP Auth usage from mail.log."""
import json
import re
import os
from datetime import datetime

SMTP_AUTH_FILE = "/etc/cmp/smtp_auth.json"
API_KEYS_FILE = "/etc/cmp/relay_api_keys.json"
LOG_FILE = "/var/log/mail.log"


def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def get_last_processed():
    """Get last processed timestamp."""
    marker = "/var/lib/cmp/.usage_last_processed"
    try:
        with open(marker) as f:
            return f.read().strip()
    except Exception:
        return ""


def set_last_processed(ts):
    """Save last processed timestamp."""
    os.makedirs("/var/lib/cmp", exist_ok=True)
    with open("/var/lib/cmp/.usage_last_processed", "w") as f:
        f.write(ts)


def track_usage():
    """Parse mail.log and update usage counts."""
    last_ts = get_last_processed()
    
    # Collect sasl_username occurrences
    usage = {}  # username -> count
    latest_ts = last_ts
    
    if not os.path.exists(LOG_FILE):
        return
    
    with open(LOG_FILE) as f:
        for line in f:
            # Parse timestamp
            ts_match = re.match(r'^(\w{3}\s+\d+\s+\d+:\d+:\d+)', line)
            if not ts_match:
                continue
            
            ts_str = ts_match.group(1)
            
            # Skip if already processed
            if ts_str <= last_ts:
                continue
            
            if ts_str > latest_ts:
                latest_ts = ts_str
            
            # Match SASL auth
            if 'sasl_username=' in line and 'client=' in line:
                user_match = re.search(r'sasl_username=(\S+)', line)
                if user_match:
                    username = user_match.group(1)
                    usage[username] = usage.get(username, 0) + 1
    
    if not usage:
        if latest_ts > last_ts:
            set_last_processed(latest_ts)
        return
    
    now = datetime.now().isoformat()
    updated = False
    
    # Update SMTP auth credentials
    if os.path.exists(SMTP_AUTH_FILE):
        data = load_json(SMTP_AUTH_FILE)
        for cred in data.get("credentials", []):
            if cred["username"] in usage:
                cred["usage_count"] = cred.get("usage_count", 0) + usage[cred["username"]]
                cred["last_used"] = now
                updated = True
        if updated:
            save_json(SMTP_AUTH_FILE, data)
    
    # Update API keys (apikey user)
    if "apikey" in usage and os.path.exists(API_KEYS_FILE):
        keys = load_json(API_KEYS_FILE)
        if isinstance(keys, list):
            for key in keys:
                if key.get("enabled"):
                    key["usage_count"] = key.get("usage_count", 0) + usage["apikey"]
                    key["last_used"] = now
                    updated = True
            save_json(API_KEYS_FILE, keys)
    
    if updated:
        set_last_processed(latest_ts)
        print(f"Updated usage: {usage}")
    else:
        set_last_processed(latest_ts)


if __name__ == "__main__":
    track_usage()
