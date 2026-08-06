"""Outgoing mail relay configuration via Postfix."""
import asyncio
import os

RELAY_CONFIG_PATH = "/etc/postfix/relay"
RELAY_MAP_PATH = "/etc/postfix/relay_map"


async def get_relay_config() -> dict:
    """Get current relay configuration."""
    config = {
        "enabled": False,
        "relay_host": "",
        "relay_port": 587,
        "relay_username": "",
        "relay_password_set": False,
        "relay_tls": True,
        "relay_auth_method": "login",
        "sender_dependent": False,
        "default_relay": None,
        "domain_relays": [],
    }

    # Check main.cf for relayhost
    try:
        with open("/etc/postfix/main.cf", "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("relayhost") and "=" in line:
                    val = line.split("=", 1)[1].strip()
                    if val:
                        config["enabled"] = True
                        # Parse [host]:port format
                        if val.startswith("["):
                            parts = val.strip("[]").split("]:")
                            config["relay_host"] = parts[0]
                            if len(parts) > 1:
                                config["relay_port"] = int(parts[1])
                        else:
                            config["relay_host"] = val
    except FileNotFoundError:
        pass

    # Check sasl_passwd for credentials
    try:
        with open("/etc/postfix/sasl_passwd", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and ":" in line:
                    _, creds = line.split(":", 1)
                    if "@" in creds:
                        config["relay_username"] = creds.split(":")[0] if ":" in creds else ""
                    config["relay_password_set"] = True
    except FileNotFoundError:
        pass

    # Check sender_dependent_relayhost_maps
    try:
        if os.path.exists("/etc/postfix/sender_relay"):
            config["sender_dependent"] = True
            with open("/etc/postfix/sender_relay", "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        parts = line.split()
                        if len(parts) >= 2:
                            config["domain_relays"].append({
                                "domain": parts[0],
                                "relay": parts[1],
                            })
    except FileNotFoundError:
        pass

    return config


async def update_relay_config(data: dict) -> dict:
    """Update relay configuration."""
    relay_host = data.get("relay_host", "")
    relay_port = data.get("relay_port", 587)
    relay_username = data.get("relay_username", "")
    relay_password = data.get("relay_password", "")
    relay_tls = data.get("relay_tls", True)
    enabled = data.get("enabled", True)

    # Build relay host string
    if enabled and relay_host:
        relay_str = f"[{relay_host}]:{relay_port}"
    else:
        relay_str = ""

    # Update main.cf
    _update_main_cf("relayhost", relay_str)

    # Update sasl_passwd
    if enabled and relay_host and relay_username:
        sasl_content = f"{relay_host}:{relay_port}\t{relay_username}:{relay_password}\n"
        _write_file("/etc/postfix/sasl_passwd", sasl_content)
        await _run_cmd("postmap", "/etc/postfix/sasl_passwd")
        os.chmod("/etc/postfix/sasl_passwd", 0o600)
        os.chmod("/etc/postfix/sasl_passwd.db", 0o600)

        # Enable SASL in main.cf
        _update_main_cf("smtp_sasl_auth_enable", "yes")
        _update_main_cf("smtp_sasl_password_maps", "hash:/etc/postfix/sasl_passwd")
        _update_main_cf("smtp_sasl_security_options", "noanonymous")
        _update_main_cf("smtp_sasl_tls_security_options", "noanonymous")
    else:
        # Disable SASL
        _update_main_cf("smtp_sasl_auth_enable", "no")
        for f in ["/etc/postfix/sasl_passwd", "/etc/postfix/sasl_passwd.db"]:
            if os.path.exists(f):
                os.remove(f)

    # TLS settings
    if relay_tls:
        _update_main_cf("smtp_tls_security_level", "encrypt")
        _update_main_cf("smtp_tls_CAfile", "/etc/ssl/certs/ca-certificates.crt")
    else:
        _update_main_cf("smtp_tls_security_level", "may")

    # Reload postfix
    await _run_cmd("postfix", "reload")

    return {"success": True, "message": "Relay configuration updated"}


async def add_domain_relay(domain: str, relay_host: str, relay_port: int = 587,
                           username: str = "", password: str = "") -> dict:
    """Add sender-dependent relay for a specific domain."""
    relay_str = f"[{relay_host}]:{relay_port}"

    # Append to sender_relay map
    map_path = "/etc/postfix/sender_relay"
    lines = []
    if os.path.exists(map_path):
        with open(map_path, "r") as f:
            lines = [l for l in f.readlines() if not l.startswith(f"@{domain}")]

    lines.append(f"@{domain}\t{relay_str}\n")
    _write_file(map_path, "".join(lines))
    await _run_cmd("postmap", map_path)

    # Update main.cf to use sender_dependent_relayhost_maps
    _update_main_cf("sender_dependent_relayhost_maps", "hash:/etc/postfix/sender_relay")

    # Add domain-specific SASL if credentials provided
    if username and password:
        sasl_path = "/etc/postfix/sasl_passwd_sender"
        sasl_lines = []
        if os.path.exists(sasl_path):
            with open(sasl_path, "r") as f:
                sasl_lines = [l for l in f.readlines() if not l.startswith(f"@{domain}")]

        sasl_lines.append(f"@{domain}\t{username}:{password}\n")
        _write_file(sasl_path, "".join(sasl_lines))
        await _run_cmd("postmap", sasl_path)
        _update_main_cf("smtp_sender_dependent_authentication", "yes")
        _update_main_cf("smtp_sasl_password_maps", 
                        f"hash:/etc/postfix/sasl_passwd, hash:{sasl_path}")

    await _run_cmd("postfix", "reload")
    return {"success": True, "message": f"Relay for {domain} added"}


async def remove_domain_relay(domain: str) -> dict:
    """Remove sender-dependent relay for a domain."""
    for path in ["/etc/postfix/sender_relay", "/etc/postfix/sasl_passwd_sender"]:
        if os.path.exists(path):
            with open(path, "r") as f:
                lines = [l for l in f.readlines() if not l.startswith(f"@{domain}")]
            _write_file(path, "".join(lines))
            await _run_cmd("postmap", path)

    await _run_cmd("postfix", "reload")
    return {"success": True, "message": f"Relay for {domain} removed"}


async def test_relay(host: str, port: int = 587, username: str = "", password: str = "") -> dict:
    """Test SMTP relay connection."""
    import smtplib
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)
            server.starttls()

        if username and password:
            server.login(username, password)

        server.quit()
        return {"success": True, "message": f"Connection to {host}:{port} OK"}
    except smtplib.SMTPAuthenticationError:
        return {"success": False, "message": "Authentication failed"}
    except smtplib.SMTPConnectError as e:
        return {"success": False, "message": f"Connection failed: {str(e)}"}
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}


async def get_relay_logs(limit: int = 50) -> list[dict]:
    """Get recent relay/sending logs from mail.log."""
    logs = []
    try:
        proc = await asyncio.create_subprocess_exec(
            "tail", "-n", str(limit), "/var/log/mail.log",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        for line in stdout.decode().split("\n"):
            if "relay=" in line or "smtp" in line.lower():
                logs.append({"line": line.strip()})
    except Exception:
        pass
    return logs


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


def _write_file(path: str, content: str):
    """Write content to file."""
    with open(path, "w") as f:
        f.write(content)


async def _run_cmd(*args):
    """Run a command."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    await proc.communicate()
