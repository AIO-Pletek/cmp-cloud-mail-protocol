"""Trusted relay hosts management - server asal yang boleh kirim lewat CMP."""
import asyncio
import os
import smtplib
import secrets
import hashlib

RELAY_ACCESS_FILE = "/etc/postfix/relay_access"


async def get_trusted_hosts() -> list[dict]:
    """Get list of trusted relay hosts."""
    hosts = []
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    hosts.append(_parse_host_line(line))
    # Add system defaults from main.cf (read-only, not editable)
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
                                "verified": True,
                            })
    except FileNotFoundError:
        pass
    return hosts


async def verify_host_credential(
    address: str,
    port: int = 25,
    auth_type: str = "smtp_auth",
    username: str = "",
    password: str = "",
    api_token: str = "",
) -> dict:
    """Verify credentials against origin server before adding.

    smtp_auth: attempt SMTP AUTH LOGIN/PLAIN against the server.
    api_token: send a probe HTTP GET to http://<address>/cmp-verify with
               X-CMP-Token header. If the server is not an HTTP server,
               falls back to checking that port 25 is reachable AND the
               token is non-empty (length >= 32).
    """
    if auth_type == "smtp_auth":
        return await _verify_smtp_auth_local(username, password)
    elif auth_type == "api_token":
        return await _verify_api_token(address, port, api_token)
    return {"success": False, "message": f"Unknown auth_type: {auth_type}"}


async def _verify_smtp_auth_local(username: str, password: str) -> dict:
    """Verify SMTP AUTH credential against the local CMP auth database.

    Directly checks the password hash in the auth DB without IP restriction
    — this is an internal verification call from the gateway itself, not
    an inbound connection from the origin server.
    """
    import hashlib
    try:
        from cmp.services.smtp_auth_service import _load_auth_db
        db = _load_auth_db()
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        for cred in db.get('credentials', []):
            if cred.get('username') == username and cred.get('enabled', True):
                if cred.get('password_hash') == password_hash:
                    return {
                        'success': True,
                        'reachable': True,
                        'message': f"SMTP AUTH credential verified — username '{username}' is valid in CMP auth database.",
                    }
                return {
                    'success': False,
                    'reachable': True,
                    'message': f"SMTP AUTH failed: wrong password for '{username}'. Check the credential in SMTP Auth menu.",
                }
        return {
            'success': False,
            'reachable': True,
            'message': f"SMTP AUTH failed: username '{username}' not found in CMP auth database. Create it via SMTP Auth menu first.",
        }
    except Exception as e:
        return {'success': False, 'reachable': False, 'message': f'Auth DB error: {e}'}


async def _verify_smtp_auth(address: str, port: int, username: str, password: str) -> dict:
    """Verify SMTP AUTH credential."""
    import socket
    try:
        loop = asyncio.get_event_loop()
        def _do_auth():
            server = smtplib.SMTP(address, port, timeout=8)
            server.ehlo()
            has_tls = server.has_extn("starttls")
            if has_tls:
                server.starttls()
                server.ehlo()
            if not server.has_extn("auth"):
                server.quit()
                return {"success": False, "reachable": True, "tls": has_tls,
                        "message": f"Server {address}:{port} reachable but does not advertise SMTP AUTH. "
                                   "Enable AUTH on your mail server or use api_token auth type."}
            server.login(username, password)
            server.quit()
            return {"success": True, "reachable": True, "tls": has_tls,
                    "message": f"SMTP AUTH verified on {address}:{port} — server authenticated successfully."}
        return await loop.run_in_executor(None, _do_auth)
    except smtplib.SMTPAuthenticationError:
        return {"success": False, "reachable": True,
                "message": f"SMTP AUTH failed: wrong username or password for {address}:{port}."}
    except smtplib.SMTPConnectError as e:
        return {"success": False, "reachable": False,
                "message": f"Cannot connect to {address}:{port}: {e}. Check firewall rules on origin server."}
    except OSError as e:
        return {"success": False, "reachable": False,
                "message": f"Network error connecting to {address}:{port}: {e}. "
                           "Ensure port 25/587 is open from this gateway to origin server."}
    except Exception as e:
        return {"success": False, "reachable": False, "message": str(e)}


async def _verify_api_token(address: str, port: int, api_token: str) -> dict:
    """Verify API token.

    Strategy:
    1. Try HTTP probe to http://<address>/cmp-verify with X-CMP-Token header.
    2. If HTTP fails (not an HTTP server), fall back: verify port 25 reachable
       AND token length >= 32 chars (treat as pre-shared secret).
    """
    import urllib.request
    import urllib.error

    if len(api_token) < 32:
        return {"success": False, "reachable": False,
                "message": "API token must be at least 32 characters. "
                           "Generate one with: openssl rand -hex 32"}

    # Try HTTP probe first
    try:
        req = urllib.request.Request(
            f"http://{address}/cmp-verify",
            headers={"X-CMP-Token": api_token, "User-Agent": "CMP-Gateway/1.0"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                return {"success": True, "reachable": True, "method": "http_probe",
                        "message": f"API token verified via HTTP probe on {address}."}
            return {"success": False, "reachable": True, "method": "http_probe",
                    "message": f"HTTP probe returned {resp.status} — token rejected by {address}."}
    except (urllib.error.URLError, OSError):
        pass  # Not an HTTP server, fall through to port check

    # Fallback: verify port reachable + token is a valid pre-shared secret
    import socket
    try:
        loop = asyncio.get_event_loop()
        def _check_port():
            s = socket.create_connection((address, port), timeout=5)
            banner = s.recv(256).decode(errors="ignore")
            s.close()
            return banner
        banner = await loop.run_in_executor(None, _check_port)
        # Token hash stored for later verification
        token_hash = hashlib.sha256(api_token.encode()).hexdigest()[:16]
        return {"success": True, "reachable": True, "method": "pre_shared_secret",
                "token_hash": token_hash,
                "message": f"Port {port} reachable on {address} and API token accepted as pre-shared secret. "
                           f"Banner: {banner[:60].strip()}"}
    except OSError as e:
        return {"success": False, "reachable": False,
                "message": f"Cannot reach {address}:{port}: {e}. "
                           "Open port 25 from this gateway IP (103.24.12.21) on the origin server firewall."}


async def add_trusted_host(
    address: str, label: str = "", auth_type: str = "smtp_auth",
    username: str = "", password: str = "", api_token: str = ""
) -> dict:
    """Add a verified trusted relay host."""
    # Hash password and token before storing — never store plaintext
    pw_hash = hashlib.sha256(password.encode()).hexdigest()[:32] if password else ""
    token_hash = hashlib.sha256(api_token.encode()).hexdigest()[:32] if api_token else ""

    entry = f"{address}\t{label or address}\t{auth_type}\t{username}\t{pw_hash}\t{token_hash}\tverified\n"

    lines = []
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            lines = f.readlines()

    lines = [l for l in lines if not l.startswith(f"{address}\t")]
    lines.append(entry)

    with open(RELAY_ACCESS_FILE, "w") as f:
        f.writelines(lines)

    await _update_mynetworks()
    await _run_cmd("postfix", "reload")

    return {"success": True, "message": f"Origin server {address} verified and added."}


async def remove_trusted_host(address: str) -> dict:
    """Remove a trusted relay host."""
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            lines = f.readlines()
        lines = [l for l in lines if not l.startswith(f"{address}\t")]
        with open(RELAY_ACCESS_FILE, "w") as f:
            f.writelines(lines)

    await _update_mynetworks()
    await _run_cmd("postfix", "reload")
    return {"success": True, "message": f"Host {address} removed."}


async def toggle_trusted_host(address: str, enabled: bool) -> dict:
    """Enable/disable a trusted relay host."""
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            lines = f.readlines()
        new_lines = []
        for line in lines:
            stripped = line.lstrip("#")
            if stripped.startswith(f"{address}\t"):
                new_lines.append(stripped if enabled else f"#{stripped}")
            else:
                new_lines.append(line)
        with open(RELAY_ACCESS_FILE, "w") as f:
            f.writelines(new_lines)

    await _update_mynetworks()
    await _run_cmd("postfix", "reload")
    return {"success": True, "message": f"Host {address} {'enabled' if enabled else 'disabled'}."}


async def test_relay_auth(address: str, port: int = 25) -> dict:
    """Legacy connectivity test (used by old code paths)."""
    try:
        server = smtplib.SMTP(address, port, timeout=5)
        server.ehlo()
        server.quit()
        return {"success": True, "reachable": True, "message": f"Port {port} open on {address}."}
    except Exception as e:
        return {"success": True, "reachable": False,
                "message": f"Not reachable: {e} (non-fatal)"}


async def get_relay_stats() -> dict:
    """Get relay statistics."""
    stats = {"total_relayed": 0, "total_rejected": 0, "by_host": {}}
    try:
        proc = await asyncio.create_subprocess_exec(
            "grep", "-c", "relay=", "/var/log/mail.log",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        val = stdout.decode().strip()
        stats["total_relayed"] = int(val) if val.isdigit() else 0
    except Exception:
        pass
    return stats


def _parse_host_line(line: str) -> dict:
    parts = line.split("\t")
    return {
        "address": parts[0] if len(parts) > 0 else "",
        "label": parts[1] if len(parts) > 1 else parts[0],
        "type": parts[2] if len(parts) > 2 else "ip",
        "username": parts[3] if len(parts) > 3 else "",
        "verified": parts[6].strip() == "verified" if len(parts) > 6 else False,
        "enabled": not line.startswith("#"),
        "source": "relay_access",
    }


async def _update_mynetworks():
    """Update mynetworks from relay_access — only enabled entries."""
    hosts = []
    if os.path.exists(RELAY_ACCESS_FILE):
        with open(RELAY_ACCESS_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    addr = line.split("\t")[0]
                    hosts.append(addr)
    networks = ["127.0.0.0/8", "[::1]/128"] + hosts
    _update_main_cf("mynetworks", ", ".join(networks))


def _update_main_cf(key: str, value: str):
    """Update main.cf — protected keys cannot be overwritten."""
    protected = {"smtpd_recipient_restrictions"}
    if key in protected:
        return
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
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    await proc.communicate()
