"""DKIM key lifecycle for the CMP gateway.

Signing is done by rspamd (Postfix milter -> rspamd:11332), which loads
/var/lib/rspamd/dkim/<domain>.<selector>.key.  Everything in this module
therefore treats that directory as the signing source of truth, and keeps
/var/lib/cmp/dkim-keys (settings.DKIM_KEY_DIR) as the platform's key store.

The old implementation wrote keys into /etc/opendkim/keys, which is not the
milter Postfix actually uses - so keys generated for new domains never made
it into the signing path.
"""
import os
import shutil
import asyncio
import subprocess
from datetime import datetime
from cmp.config import settings


# ── paths ────────────────────────────────────────────────────────────────
def signing_key_path(domain: str, selector: str) -> str:
    """Path rspamd reads the private signing key from."""
    return os.path.join(settings.RSPAMD_DKIM_DIR, f"{domain}.{selector}.key")


def get_private_key_path(domain: str, selector: str) -> str:
    """Path of the platform key store copy (source for publishing)."""
    return os.path.join(settings.DKIM_KEY_DIR, f"{domain}.{selector}.private")


def get_public_key_path(domain: str, selector: str) -> str:
    return os.path.join(settings.DKIM_KEY_DIR, f"{domain}.{selector}.public")


# ── key material helpers ─────────────────────────────────────────────────
def _b64_from_pem(pem: str) -> str:
    lines = pem.strip().split("\n")
    key_b64 = "".join(line for line in lines if not line.startswith("-----"))
    key_b64 = key_b64.replace(" ", "").replace("\n", "").replace("\r", "")
    return key_b64.rstrip("=")


def dns_record_from_pem(pem: str) -> str:
    """Turn a PEM public key into a DKIM TXT record value."""
    return f"v=DKIM1; k=rsa; p={_b64_from_pem(pem)}"


async def generate_key(domain: str, selector: str) -> tuple[str, str]:
    """Generate a fresh RSA-2048 keypair in the platform key store."""
    key_dir = settings.DKIM_KEY_DIR
    os.makedirs(key_dir, exist_ok=True)

    private_key_path = get_private_key_path(domain, selector)
    public_key_path = get_public_key_path(domain, selector)

    proc = await asyncio.create_subprocess_exec(
        "openssl", "genrsa", "-out", private_key_path, "2048",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("Failed to generate RSA private key")

    proc = await asyncio.create_subprocess_exec(
        "openssl", "rsa", "-in", private_key_path, "-pubout", "-out", public_key_path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("Failed to extract public key")

    os.chmod(private_key_path, 0o600)

    with open(private_key_path, "r") as f:
        private_key = f.read()
    with open(public_key_path, "r") as f:
        public_key = f.read()

    return private_key, public_key


# ── publishing into the rspamd signing path ──────────────────────────────
def publish_signing_key(domain: str, selector: str, private_key_pem: str) -> str:
    """Write the private key where rspamd reads it, with sane ownership."""
    path = signing_key_path(domain, selector)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    tmp = f"{path}.tmp"
    with open(tmp, "w") as f:
        f.write(private_key_pem)

    # rspamd runs as _rspamd; fall back to world-readable if the user is absent
    try:
        import grp
        import pwd
        os.chown(tmp, pwd.getpwnam("_rspamd").pw_uid, grp.getgrnam("_rspamd").gr_gid)
        os.chmod(tmp, 0o640)
    except Exception:
        os.chmod(tmp, 0o644)

    os.replace(tmp, path)
    return path


def reload_rspamd() -> bool:
    """Make rspamd pick up new/rotated keys. Best effort, never fatal."""
    for cmd in (
        ["systemctl", "reload", "rspamd.service"],
        ["rspamadm", "control", "reload"],
        ["systemctl", "restart", "rspamd.service"],
    ):
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if res.returncode == 0:
                return True
        except Exception:
            continue
    return False


async def ensure_signing_key(domain: str, selector: str | None = None) -> str:
    """Guarantee a usable rspamd signing key for a domain.

    Returns "present" when the key was already live, "generated" when a new
    keypair had to be created, "failed" when no key could be produced.
    """
    selector = selector or settings.DKIM_SELECTOR
    if os.path.exists(signing_key_path(domain, selector)):
        return "present"

    store_key = get_private_key_path(domain, selector)
    if os.path.exists(store_key):
        with open(store_key) as f:
            publish_signing_key(domain, selector, f.read())
        reload_rspamd()
        return "present"

    try:
        private_key, _ = await generate_key(domain, selector)
        publish_signing_key(domain, selector, private_key)
        reload_rspamd()
        return "generated"
    except Exception:
        return "failed"


async def rotate_key(domain: str, selector: str | None = None) -> tuple[str, str]:
    """Generate and publish a brand new keypair (same selector).

    Returns (selector, public_key_pem). The previous store key is archived
    next to it so a rollback is a file copy away.
    """
    selector = selector or settings.DKIM_SELECTOR
    old_path = get_private_key_path(domain, selector)
    if os.path.exists(old_path):
        stamp = datetime.now().strftime("%Y%m%d%H%M%S")
        shutil.copy2(old_path, f"{old_path}.bak-{stamp}")

    private_key, public_key = await generate_key(domain, selector)
    publish_signing_key(domain, selector, private_key)
    reload_rspamd()
    return selector, public_key


# ── legacy helpers (kept for compatibility) ──────────────────────────────
async def get_dns_record(domain: str, selector: str) -> str:
    public_key_path = get_public_key_path(domain, selector)
    if not os.path.exists(public_key_path):
        raise FileNotFoundError(f"Public key not found for {domain} with selector {selector}")
    with open(public_key_path, "r") as f:
        return dns_record_from_pem(f.read())
