"""SMTP AUTH credentials management for relay authentication."""
import asyncio
import os
import secrets
import hashlib
import json
from datetime import datetime

AUTH_DB = "/etc/cmp/smtp_auth.json"
POSTFIX_SASL_LDAP = "/etc/postfix/sasl_relay_auth"


def _load_auth_db() -> dict:
    """Load auth database."""
    try:
        with open(AUTH_DB) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"credentials": [], "settings": {"method": "file"}}


def _save_auth_db(data: dict):
    """Save auth database."""
    os.makedirs(os.path.dirname(AUTH_DB), exist_ok=True)
    with open(AUTH_DB, "w") as f:
        json.dump(data, f, indent=2)
    os.chmod(AUTH_DB, 0o600)


async def list_credentials() -> list[dict]:
    """List all SMTP AUTH credentials (without exposing passwords)."""
    db = _load_auth_db()
    result = []
    for cred in db.get("credentials", []):
        result.append({
            "id": cred["id"],
            "username": cred["username"],
            "label": cred.get("label", ""),
            "allowed_ips": cred.get("allowed_ips", []),
            "enabled": cred.get("enabled", True),
            "created_at": cred.get("created_at"),
            "last_used": cred.get("last_used"),
            "usage_count": cred.get("usage_count", 0),
            "password_preview": "***" + cred["password"][-4:] if cred.get("password") else "***",
        })
    return result


async def create_credential(username: str, password: str = None,
                            label: str = "", allowed_ips: list[str] = None) -> dict:
    """Create SMTP AUTH credentials for a relay client."""
    db = _load_auth_db()
    
    # Check if username already exists
    for cred in db["credentials"]:
        if cred["username"] == username:
            return {"success": False, "message": f"Username '{username}' already exists"}
    
    # Generate password if not provided
    if not password:
        password = secrets.token_urlsafe(24)
    
    # Hash password for storage
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    entry = {
        "id": secrets.token_hex(8),
        "username": username,
        "password_hash": password_hash,
        "password": password,  # Stored encrypted in production, plain for now
        "label": label or username,
        "allowed_ips": allowed_ips or [],
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
        "last_used": None,
        "usage_count": 0,
    }
    
    db["credentials"].append(entry)
    _save_auth_db(db)
    
    # Update Postfix SASL config
    await _update_postfix_sasl(db)
    
    # Reload Postfix
    await _run_cmd("postfix", "reload")
    
    _audit_log("credential_created", f"username={username}")
    
    return {
        "success": True,
        "username": username,
        "password": password,  # Only shown once!
        "message": "SMTP AUTH credentials created. Save the password!",
    }


async def delete_credential(credential_id: str) -> dict:
    """Delete SMTP AUTH credentials."""
    db = _load_auth_db()
    db["credentials"] = [c for c in db["credentials"] if c["id"] != credential_id]
    _save_auth_db(db)
    
    await _update_postfix_sasl(db)
    await _run_cmd("postfix", "reload")
    
    _audit_log("credential_deleted", f"id={credential_id}")
    return {"success": True, "message": "Credential deleted"}


async def toggle_credential(credential_id: str, enabled: bool) -> dict:
    """Enable/disable SMTP AUTH credentials."""
    db = _load_auth_db()
    for cred in db["credentials"]:
        if cred["id"] == credential_id:
            cred["enabled"] = enabled
            break
    _save_auth_db(db)
    
    await _update_postfix_sasl(db)
    await _run_cmd("postfix", "reload")
    
    return {"success": True, "message": f"Credential {'enabled' if enabled else 'disabled'}"}


async def verify_smtp_auth(username: str, password: str, client_ip: str = "") -> dict:
    """Verify SMTP AUTH credentials (called by Postfix via check_policy_service)."""
    db = _load_auth_db()
    
    for cred in db["credentials"]:
        if cred["username"] == username and cred.get("enabled", True):
            # Check password
            password_hash = hashlib.sha256(password.encode()).hexdigest()
            if cred["password_hash"] == password_hash:
                # Check IP allowlist
                if cred.get("allowed_ips") and client_ip not in cred["allowed_ips"]:
                    return {"authenticated": False, "reason": "IP not allowed"}
                
                # Update usage
                cred["last_used"] = datetime.utcnow().isoformat()
                cred["usage_count"] = cred.get("usage_count", 0) + 1
                _save_auth_db(db)
                
                return {"authenticated": True, "username": username}
    
    _audit_log("auth_failure", f"username={username} ip={client_ip}")
    return {"authenticated": False, "reason": "Invalid credentials"}


async def get_relay_instructions(username: str) -> dict:
    """Get relay configuration instructions for a client."""
    db = _load_auth_db()
    
    for cred in db["credentials"]:
        if cred["username"] == username:
            return {
                "username": username,
                "server": "mailprotocol.cbncloud.net",
                "ports": {
                    "submission": 587,
                    "smtps": 465,
                    "smtp": 25,
                },
                "tls": "required",
                "auth_method": "PLAIN or LOGIN",
                "postfix_config": f"""
# Postfix main.cf
relayhost = [mailprotocol.cbncloud.net]:587
smtp_tls_security_level = encrypt
smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt
smtp_sasl_auth_enable = yes
smtp_sasl_security_options = noanonymous
smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
smtp_sasl_tls_security_options = noanonymous

# Postfix sasl_passwd
[mailprotocol.cbncloud.net]:587    {username}:YOUR_PASSWORD_HERE
""",
                "cpanel_config": {
                    "smtp_server": "mailprotocol.cbncloud.net",
                    "smtp_port": 587,
                    "smtp_auth": "Yes",
                    "smtp_username": username,
                    "smtp_password": "YOUR_PASSWORD_HERE",
                    "smtp_tls": "Yes",
                },
            }
    
    return {"error": "Credential not found"}


async def _update_postfix_sasl(db: dict):
    """Update Postfix SASL password map."""
    # Create sasl_passwd file
    lines = []
    for cred in db.get("credentials", []):
        if cred.get("enabled", True):
            username = cred["username"]
            password = cred.get("password", "")
            # Format: [server]:port    username:password
            lines.append(f"[mailprotocol.cbncloud.net]:587\t{username}:{password}\n")
            lines.append(f"[mailprotocol.cbncloud.net]:465\t{username}:{password}\n")
            lines.append(f"mailprotocol.cbncloud.net\t{username}:{password}\n")
    
    sasl_path = "/etc/postfix/sasl_relay_passwd"
    with open(sasl_path, "w") as f:
        f.writelines(lines)
    os.chmod(sasl_path, 0o600)
    
    # Run postmap
    await _run_cmd("postmap", sasl_path)


def _audit_log(action: str, details: str):
    """Write audit log."""
    log_path = "/var/log/cmp/audit.log"
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    timestamp = datetime.utcnow().isoformat()
    with open(log_path, "a") as f:
        f.write(f"[{timestamp}] SMTP_AUTH {action}: {details}\n")


async def _run_cmd(*args):
    """Run a command."""
    proc = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    await proc.communicate()
