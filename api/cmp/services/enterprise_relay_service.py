"""Enterprise-grade relay authentication and security."""
import asyncio
import os
import hashlib
import secrets
import json
from datetime import datetime

CONFIG_DIR = "/etc/cmp"
RELAY_CONFIG = f"{CONFIG_DIR}/relay_config.json"
API_KEYS_FILE = f"{CONFIG_DIR}/relay_api_keys.json"
RATE_LIMIT_FILE = f"{CONFIG_DIR}/rate_limits.json"
AUDIT_LOG = "/var/log/cmp/relay_audit.log"

os.makedirs(CONFIG_DIR, exist_ok=True)


# ==================== RELAY AUTH ====================

async def get_relay_auth_config() -> dict:
    """Get enterprise relay authentication configuration."""
    config = _load_json(RELAY_CONFIG, {
        "global": {
            "require_tls": True,
            "min_tls_version": "TLSv1.2",
            "require_auth": True,
            "auth_methods": ["smtp_auth", "api_key"],
            "max_message_size_mb": 25,
            "max_recipients_per_message": 50,
            "reject_unauthenticated": True,
        },
        "rate_limits": {
            "per_ip_per_minute": 60,
            "per_ip_per_hour": 1000,
            "per_ip_per_day": 10000,
            "per_auth_per_minute": 120,
            "per_auth_per_hour": 5000,
            "connections_per_ip": 10,
        },
        "verification": {
            "require_helo": True,
            "reject_invalid_helo": True,
            "require_reverse_dns": False,
            "check_dnsbl": True,
            "dnsbl_servers": [
                "zen.spamhaus.org",
                "bl.spamcop.net",
                "b.barracudacentral.org",
                "dnsbl.sorbs.net",
            ],
            "check_spf": True,
            "spf_fail_action": "quarantine",
            "check_dkim": True,
            "dkim_fail_action": "add_header",
            "check_dmarc": True,
            "dmarc_fail_action": "quarantine",
        },
        "filtering": {
            "spam_threshold_add_header": 4.0,
            "spam_threshold_quarantine": 6.0,
            "spam_threshold_reject": 8.0,
            "virus_action": "reject",
            "banned_attachment_action": "quarantine",
            "banned_extensions": [
                ".exe", ".scr", ".bat", ".cmd", ".com", ".pif",
                ".vbs", ".js", ".wsf", ".wsh", ".ps1", ".msi"
            ],
            "max_attachment_size_mb": 20,
            "enable_dlp": True,
            "dlp_patterns": [
                {"name": "Credit Card", "pattern": "\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b", "action": "quarantine"},
                {"name": "SSN", "pattern": "\\b\\d{3}-\\d{2}-\\d{4}\\b", "action": "quarantine"},
            ],
        },
        "notifications": {
            "admin_email": "admin@cbncloud.net",
            "notify_on_virus": True,
            "notify_on_high_spam": True,
            "notify_on_dlp": True,
            "notify_on_auth_failure": True,
            "webhook_url": "",
            "webhook_events": ["virus", "high_spam", "dlp", "auth_failure"],
        },
    })
    return config


async def update_relay_auth_config(data: dict) -> dict:
    """Update enterprise relay authentication configuration."""
    _save_json(RELAY_CONFIG, data)
    
    # Apply to Postfix
    await _apply_postfix_config(data)
    
    # Apply to Rspamd
    await _apply_rspamd_config(data)
    
    # Apply to Fail2ban
    await _apply_fail2ban_config(data)
    
    _audit_log("config_update", "relay_auth_config updated")
    
    return {"success": True, "message": "Enterprise relay config updated"}


# ==================== API KEYS ====================

async def list_api_keys() -> list[dict]:
    """List all relay API keys."""
    keys = _load_json(API_KEYS_FILE, [])
    # Don't expose full key
    for k in keys:
        k["key_preview"] = k["key"][:8] + "..." + k["key"][-4:]
        del k["key"]
    return keys


async def create_api_key(label: str, allowed_ips: list[str] = None,
                         rate_limit: int = None, expires_days: int = 365) -> dict:
    """Create a new relay API key."""
    keys = _load_json(API_KEYS_FILE, [])
    
    key = f"cmp_relay_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    
    entry = {
        "id": secrets.token_hex(8),
        "label": label,
        "key": key,
        "key_hash": key_hash,
        "allowed_ips": allowed_ips or [],
        "rate_limit_override": rate_limit,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": None,  # TODO: calculate from expires_days
        "last_used": None,
        "usage_count": 0,
        "enabled": True,
    }
    
    keys.append(entry)
    _save_json(API_KEYS_FILE, keys)
    
    _audit_log("api_key_created", f"label={label}")
    
    return {
        "success": True,
        "key": key,  # Only shown once!
        "key_id": entry["id"],
        "message": "Save this key - it won't be shown again!",
    }


async def revoke_api_key(key_id: str) -> dict:
    """Revoke an API key."""
    keys = _load_json(API_KEYS_FILE, [])
    keys = [k for k in keys if k["id"] != key_id]
    _save_json(API_KEYS_FILE, keys)
    
    _audit_log("api_key_revoked", f"key_id={key_id}")
    return {"success": True, "message": "API key revoked"}


async def verify_api_key(key: str, client_ip: str = "") -> dict:
    """Verify a relay API key."""
    keys = _load_json(API_KEYS_FILE, [])
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    
    for k in keys:
        if k["key_hash"] == key_hash and k.get("enabled", True):
            # Check IP allowlist
            if k.get("allowed_ips") and client_ip not in k["allowed_ips"]:
                return {"valid": False, "reason": "IP not allowed"}
            
            # Update usage
            k["last_used"] = datetime.utcnow().isoformat()
            k["usage_count"] = k.get("usage_count", 0) + 1
            _save_json(API_KEYS_FILE, keys)
            
            return {"valid": True, "key_id": k["id"], "label": k["label"]}
    
    return {"valid": False, "reason": "Invalid key"}


# ==================== RATE LIMITING ====================

async def get_rate_limits() -> dict:
    """Get current rate limit configuration."""
    config = await get_relay_auth_config()
    return config.get("rate_limits", {})


async def update_rate_limits(data: dict) -> dict:
    """Update rate limits."""
    config = await get_relay_auth_config()
    config["rate_limits"] = data
    _save_json(RELAY_CONFIG, config)
    
    # Apply to Postfix
    await _apply_rate_limits(data)
    
    _audit_log("rate_limit_update", str(data))
    return {"success": True, "message": "Rate limits updated"}


# ==================== TRUSTED HOSTS (Enhanced) ====================

async def get_trusted_hosts() -> list[dict]:
    """Get all trusted hosts with security details."""
    hosts = []
    config = await get_relay_auth_config()
    
    # Read from Postfix mynetworks
    try:
        with open("/etc/postfix/main.cf") as f:
            for line in f:
                if line.strip().startswith("mynetworks"):
                    networks = line.split("=", 1)[1].strip()
                    for net in networks.split(","):
                        net = net.strip()
                        if net and net not in ["127.0.0.0/8", "[::1]/128"]:
                            hosts.append({
                                "address": net,
                                "label": net,
                                "auth_type": "ip",
                                "enabled": True,
                                "tls_required": config["global"]["require_tls"],
                                "rate_limit": config["rate_limits"]["per_ip_per_hour"],
                                "connections": config["rate_limits"]["connections_per_ip"],
                                "last_seen": None,
                                "total_relayed": 0,
                            })
    except FileNotFoundError:
        pass
    
    return hosts


async def add_trusted_host(address: str, label: str = "", auth_type: str = "ip",
                           username: str = "", password: str = "",
                           rate_limit: int = None, max_connections: int = None) -> dict:
    """Add a trusted host with enterprise security settings."""
    config = await get_relay_auth_config()
    
    # Add to Postfix mynetworks
    current_mynetworks = ""
    try:
        with open("/etc/postfix/main.cf") as f:
            for line in f:
                if line.strip().startswith("mynetworks"):
                    current_mynetworks = line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    
    networks = [n.strip() for n in current_mynetworks.split(",") if n.strip()]
    if address not in networks:
        networks.append(address)
    
    # Update main.cf
    _update_main_cf("mynetworks", ", ".join(networks))
    
    # Add SMTP AUTH credentials if provided
    if auth_type == "smtp_auth" and username and password:
        _add_smtp_auth(address, username, password)
    
    # Reload Postfix
    await _run_cmd("postfix", "reload")
    
    _audit_log("trusted_host_added", f"address={address} auth={auth_type}")
    
    return {"success": True, "message": f"Trusted host {address} added with {auth_type} auth"}


async def remove_trusted_host(address: str) -> dict:
    """Remove a trusted host."""
    # Remove from mynetworks
    try:
        with open("/etc/postfix/main.cf") as f:
            lines = f.readlines()
        
        new_lines = []
        for line in lines:
            if line.strip().startswith("mynetworks"):
                networks = line.split("=", 1)[1].strip()
                networks = [n.strip() for n in networks.split(",") if n.strip() and n.strip() != address]
                new_lines.append(f"mynetworks = {', '.join(networks)}\n")
            else:
                new_lines.append(line)
        
        with open("/etc/postfix/main.cf", "w") as f:
            f.writelines(new_lines)
    except FileNotFoundError:
        pass
    
    await _run_cmd("postfix", "reload")
    
    _audit_log("trusted_host_removed", f"address={address}")
    return {"success": True, "message": f"Trusted host {address} removed"}


# ==================== INTERNAL HELPERS ====================

def _load_json(path: str, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _save_json(path: str, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _audit_log(action: str, details: str):
    os.makedirs(os.path.dirname(AUDIT_LOG), exist_ok=True)
    timestamp = datetime.utcnow().isoformat()
    with open(AUDIT_LOG, "a") as f:
        f.write(f"[{timestamp}] {action}: {details}\n")


def _update_main_cf(key: str, value: str):
    path = "/etc/postfix/main.cf"
    lines = []
    found = False
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                if line.strip().startswith(f"{key} =") or line.strip().startswith(f"{key}="):
                    lines.append(f"{key} = {value}\n")
                    found = True
                else:
                    lines.append(line)
    if not found:
        lines.append(f"{key} = {value}\n")
    with open(path, "w") as f:
        f.writelines(lines)


def _add_smtp_auth(address: str, username: str, password: str):
    """Add SMTP AUTH credentials for a host."""
    path = "/etc/postfix/sasl_passwd_relay"
    lines = []
    if os.path.exists(path):
        with open(path) as f:
            lines = [l for l in f.readlines() if not l.startswith(f"[{address}]")]
    lines.append(f"[{address}]\t{username}:{password}\n")
    with open(path, "w") as f:
        f.writelines(lines)


async def _apply_postfix_config(config: dict):
    """Apply enterprise config to Postfix."""
    global_cfg = config.get("global", {})
    
    # TLS
    if global_cfg.get("require_tls"):
        _update_main_cf("smtpd_tls_security_level", "may")  # Opportunistic for inbound
        _update_main_cf("smtp_tls_security_level", "encrypt")  # Mandatory for outbound
        _update_main_cf("smtp_tls_mandatory_protocols", global_cfg.get("min_tls_version", ">=TLSv1.2"))
        _update_main_cf("smtpd_tls_mandatory_protocols", global_cfg.get("min_tls_version", ">=TLSv1.2"))
    
    # Message size
    max_size = global_cfg.get("max_message_size_mb", 25) * 1024 * 1024
    _update_main_cf("message_size_limit", str(max_size))
    
    # Recipient limit
    _update_main_cf("smtpd_recipient_limit", str(global_cfg.get("max_recipients_per_message", 50)))
    
    # Auth requirements
    restrictions = ["permit_sasl_authenticated", "permit_mynetworks"]
    
    verif = config.get("verification", {})
    if verif.get("check_spf"):
        restrictions.append("check_policy_service unix:private/policyd-spf")
    restrictions.append("reject_unauth_destination")
    
    _update_main_cf("smtpd_recipient_restrictions", ", ".join(restrictions))
    
    # HELO restrictions
    if verif.get("require_helo"):
        _update_main_cf("smtpd_helo_required", "yes")
        if verif.get("reject_invalid_helo"):
            _update_main_cf("smtpd_helo_restrictions", "reject_invalid_helo_hostname, permit")
    
    # Reverse DNS
    if verif.get("require_reverse_dns"):
        _update_main_cf("smtpd_client_restrictions", "reject_unknown_client_hostname, permit")


async def _apply_rspamd_config(config: dict):
    """Apply enterprise config to Rspamd."""
    filtering = config.get("filtering", {})
    
    # Write Rspamd metrics config
    metrics_content = f"""
actions {{
    add_header = {filtering.get('spam_threshold_add_header', 4.0)};
    reject = {filtering.get('spam_threshold_reject', 8.0)};
    greylist = {filtering.get('spam_threshold_quarantine', 6.0)};
}}
"""
    os.makedirs("/etc/rspamd/local.d", exist_ok=True)
    with open("/etc/rspamd/local.d/metrics.conf", "w") as f:
        f.write(metrics_content)
    
    # DNSBL config
    verif = config.get("verification", {})
    if verif.get("check_dnsbl"):
        dnsbl_content = "servers = \""
        dnsbl_content += "; ".join(verif.get("dnsbl_servers", ["zen.spamhaus.org"]))
        dnsbl_content += "\";\n"
        with open("/etc/rspamd/local.d/rbl.conf", "w") as f:
            f.write(dnsbl_content)


async def _apply_fail2ban_config(config: dict):
    """Apply Fail2ban config for relay auth failures."""
    jail_content = """
[postfix-relay]
enabled  = true
port     = smtp,465,587
filter   = postfix
logpath  = /var/log/mail.log
maxretry = 5
findtime = 600
bantime  = 3600
"""
    os.makedirs("/etc/fail2ban/jail.d", exist_ok=True)
    with open("/etc/fail2ban/jail.d/cmp-relay.conf", "w") as f:
        f.write(jail_content)


async def _apply_rate_limits(data: dict):
    """Apply rate limits to Postfix."""
    # Postfix rate limiting via anvil
    _update_main_cf("smtpd_client_connection_rate_limit", str(data.get("connections_per_ip", 10)))
    _update_main_cf("smtpd_client_message_rate_limit", str(data.get("per_ip_per_minute", 60)))


async def _run_cmd(*args):
    proc = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    await proc.communicate()
