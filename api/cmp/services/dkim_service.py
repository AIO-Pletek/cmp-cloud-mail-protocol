import os
import asyncio
import base64
from cmp.config import settings


async def generate_key(domain: str, selector: str) -> tuple[str, str]:
    key_dir = settings.DKIM_KEY_DIR
    os.makedirs(key_dir, exist_ok=True)

    private_key_path = os.path.join(key_dir, f"{domain}.{selector}.private")
    public_key_path = os.path.join(key_dir, f"{domain}.{selector}.public")

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

    with open(private_key_path, "r") as f:
        private_key = f.read()
    with open(public_key_path, "r") as f:
        public_key = f.read()

    return private_key, public_key


async def get_dns_record(domain: str, selector: str) -> str:
    public_key_path = os.path.join(settings.DKIM_KEY_DIR, f"{domain}.{selector}.public")
    if not os.path.exists(public_key_path):
        raise FileNotFoundError(f"Public key not found for {domain} with selector {selector}")

    with open(public_key_path, "r") as f:
        public_key = f.read()

    # Extract raw base64 key from PEM
    lines = public_key.strip().split("\n")
    key_b64 = "".join(line for line in lines if not line.startswith("-----"))
    # Remove whitespace from base64
    key_b64 = key_b64.replace(" ", "").replace("\n", "").replace("\r", "")
    # Remove trailing = padding if needed to make it a single line
    # Rsplit the b64 into 255-char chunks for DNS TXT record
    dns_value = key_b64.rstrip("=")
    return f"v=DKIM1; k=rsa; p={dns_value}"


def get_private_key_path(domain: str, selector: str) -> str:
    return os.path.join(settings.DKIM_KEY_DIR, f"{domain}.{selector}.private")
