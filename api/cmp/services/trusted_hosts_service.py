"""Trusted relay hosts management - server asal yang boleh kirim lewat CMP."""
import asyncio
import os

MYNETWORKS_FILE = "/etc/postfix/mynetworks"
RELAY_ACCESS_FILE = "/etc/postfix/relay_access"


async def get_trusted_hosts() -> list[dict]:
    """Get list of trusted relay hosts (mynetworks)."""
    hosts = []
    
    # Read from custom file first
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    hosts.append(_parse_host_line(line))
    
    # Also read default mynetworks from main.cf
    try:
        with open("/etc/postfix/main.cf", "r") as f:
            for line in f:
                if line.strip().startswith("mynetworks"):
                    val = line.split("=", 1)[1].strip()
                    for item in val.split(","):
                        item = item.strip()
                        if item and not any(h["address"] == item for h in hosts):
                            hosts.append({
                                "address": item,
                                "label": "System default",
                                "type": "ip",
                                "enabled": True,
                                "source": "main.cf",
                            })
    except FileNotFoundError:
        pass
    
    return hosts


async def add_trusted_host(address: str, label: str = "", auth_type: str = "ip",
                           username: str = "", password: str = "") -> dict:
    """Add a trusted relay host."""
    # Validate address format
    if "/" in address:
        # CIDR notation
        addr_type = "cidr"
    elif "@" in address:
        addr_type = "email"
    else:
        addr_type = "ip"
    
    # Add to relay_access file
    entry = f"{address}\t{label or address}\t{auth_type}\t{username}\t{password}\n"
    
    lines = []
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            lines = f.readlines()
    
    # Remove existing entry for same address
    lines = [l for l in lines if not l.startswith(f"{address}\t")]
    lines.append(entry)
    
    with open(RELAY_ACCESS_FILE, "w") as f:
        f.writelines(lines)
    
    # Update mynetworks in main.cf
    await _update_mynetworks()
    
    # Update smtpd_recipient_restrictions to allow relay from these hosts
    await _update_relay_access()
    
    # Reload postfix
    await _run_cmd("postfix", "reload")
    
    return {"success": True, "message": f"Trusted host {address} added"}


async def remove_trusted_host(address: str) -> dict:
    """Remove a trusted relay host."""
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            lines = f.readlines()
        lines = [l for l in lines if not l.startswith(f"{address}\t")]
        with open(RELAY_ACCESS_FILE, "w") as f:
            f.writelines(lines)
    
    await _update_mynetworks()
    await _update_relay_access()
    await _run_cmd("postfix", "reload")
    
    return {"success": True, "message": f"Trusted host {address} removed"}


async def toggle_trusted_host(address: str, enabled: bool) -> dict:
    """Enable/disable a trusted relay host."""
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            lines = f.readlines()
        
        new_lines = []
        for line in lines:
            if line.startswith(f"{address}\t"):
                parts = line.strip().split("\t")
                # Toggle by adding/removing # prefix
                if enabled:
                    new_lines.append(line.lstrip("#"))
                else:
                    new_lines.append(f"#{line}")
            else:
                new_lines.append(line)
        
        with open(RELAY_ACCESS_FILE, "w") as f:
            f.writelines(new_lines)
    
    await _update_mynetworks()
    await _run_cmd("postfix", "reload")
    
    return {"success": True, "message": f"Trusted host {address} {'enabled' if enabled else 'disabled'}"}


async def test_relay_auth(address: str, port: int = 25) -> dict:
    """Test if origin server can connect and relay through CMP."""
    import smtplib
    try:
        server = smtplib.SMTP(address, port, timeout=10)
        server.ehlo()
        
        # Check if STARTTLS is available
        has_tls = server.has_extn("starttls")
        if has_tls:
            server.starttls()
            server.ehlo()
        
        server.quit()
        return {
            "success": True,
            "message": f"Connection to {address}:{port} OK",
            "tls_available": has_tls,
        }
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {str(e)}"}


async def get_relay_stats() -> dict:
    """Get relay statistics - how many emails received from trusted hosts."""
    stats = {
        "total_relayed": 0,
        "total_rejected": 0,
        "by_host": {},
    }
    
    try:
        proc = await asyncio.create_subprocess_exec(
            "grep", "-c", "relay=", "/var/log/mail.log",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        stats["total_relayed"] = int(stdout.decode().strip()) if stdout.decode().strip().isdigit() else 0
    except Exception:
        pass
    
    return stats


def _parse_host_line(line: str) -> dict:
    """Parse a relay_access file line."""
    parts = line.split("\t")
    return {
        "address": parts[0] if len(parts) > 0 else "",
        "label": parts[1] if len(parts) > 1 else parts[0],
        "type": parts[2] if len(parts) > 2 else "ip",
        "username": parts[3] if len(parts) > 3 else "",
        "enabled": not line.startswith("#"),
        "source": "relay_access",
    }


async def _update_mynetworks():
    """Update mynetworks in main.cf based on relay_access."""
    hosts = []
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    addr = line.split("\t")[0]
                    hosts.append(addr)
    
    # Always include localhost
    networks = ["127.0.0.0/8", "[::1]/128"] + hosts
    mynetworks = ", ".join(networks)
    
    _update_main_cf("mynetworks", mynetworks)


async def _update_relay_access():
    """Update smtpd_recipient_restrictions to allow relay from trusted hosts."""
    # Read current restrictions
    current = ""
    try:
        with open("/etc/postfix/main.cf", "r") as f:
            for line in f:
                if line.strip().startswith("smtpd_recipient_restrictions"):
                    current = line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    
    # Build new restrictions
    restrictions = [
        "permit_sasl_authenticated",
        "permit_mynetworks",
        "reject_unauth_destination",
    ]
    
    _update_main_cf("smtpd_recipient_restrictions", ", ".join(restrictions))
    
    # Enable SASL for relay auth
    _update_main_cf("smtpd_sasl_auth_enable", "yes")
    _update_main_cf("smtpd_sasl_type", "dovecot")
    _update_main_cf("smtpd_sasl_path", "private/auth")
    _update_main_cf("smtpd_sasl_security_options", "noanonymous")


def _update_main_cf(key: str, value: str):
    """Update or add a setting in main.cf."""
    path = "/etc/postfix/main.cf"
    lines = []
    found = False
    
    if os.path.exists(path):
        with open(path, "r") as f:
            for line in f:
                stripped = line.strip()
                if stripped.startswith(f"{key} =") or stripped.startswith(f"{key}="):
                    if value:
                        lines.append(f"{key} = {value}\n")
                    found = True
                else:
                    lines.append(line)
    
    if not found and value:
        lines.append(f"{key} = {value}\n")
    
    with open(path, "w") as f:
        f.writelines(lines)


async def _run_cmd(*args):
    """Run a command."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    await proc.communicate()
