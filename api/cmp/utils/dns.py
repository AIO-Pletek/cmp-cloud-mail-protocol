import asyncio
import os
import subprocess
import uuid
import dns.resolver
from cmp.config import settings


async def check_mx_record(domain: str) -> dict:
    loop = asyncio.get_event_loop()
    try:
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(domain, "MX")
        )
        records = [str(r.exchange).rstrip(".") for r in answers]
        return {"ok": True, "records": records, "message": f"Found {len(records)} MX record(s)"}
    except dns.resolver.NXDOMAIN:
        return {"ok": False, "records": [], "message": "Domain does not exist (NXDOMAIN)"}
    except dns.resolver.NoAnswer:
        return {"ok": False, "records": [], "message": "No MX records found"}
    except dns.resolver.NoNameservers:
        return {"ok": False, "records": [], "message": "No nameservers available"}
    except Exception as e:
        return {"ok": False, "records": [], "message": f"DNS error: {str(e)}"}


async def check_spf_record(domain: str) -> dict:
    loop = asyncio.get_event_loop()
    try:
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(domain, "TXT")
        )
        spf_records = [str(r).strip('"') for r in answers if "v=spf1" in str(r)]
        if spf_records:
            return {"ok": True, "records": spf_records, "message": "SPF record found"}
        return {"ok": False, "records": [], "message": "No SPF record found"}
    except dns.resolver.NXDOMAIN:
        return {"ok": False, "records": [], "message": "Domain does not exist"}
    except dns.resolver.NoAnswer:
        return {"ok": False, "records": [], "message": "No TXT records found"}
    except Exception as e:
        return {"ok": False, "records": [], "message": f"DNS error: {str(e)}"}


async def check_dkim_record(domain: str, selector: str = "cmp") -> dict:
    dkim_domain = f"{selector}._domainkey.{domain}"
    loop = asyncio.get_event_loop()
    try:
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(dkim_domain, "TXT")
        )
        records = [str(r).strip('"') for r in answers]
        if records:
            return {"ok": True, "records": records, "message": f"DKIM record found for selector '{selector}'"}
        return {"ok": False, "records": [], "message": f"No DKIM record for selector '{selector}'"}
    except dns.resolver.NXDOMAIN:
        return {"ok": False, "records": [], "message": f"DKIM selector '{selector}' not found"}
    except dns.resolver.NoAnswer:
        return {"ok": False, "records": [], "message": f"No TXT records for DKIM selector '{selector}'"}
    except Exception as e:
        return {"ok": False, "records": [], "message": f"DNS error: {str(e)}"}


async def check_dmarc_record(domain: str) -> dict:
    dmarc_domain = f"_dmarc.{domain}"
    loop = asyncio.get_event_loop()
    try:
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(dmarc_domain, "TXT")
        )
        records = [str(r).strip('"') for r in answers if "v=DMARC1" in str(r)]
        if records:
            return {"ok": True, "records": records, "message": "DMARC record found"}
        return {"ok": False, "records": [], "message": "No DMARC record found"}
    except dns.resolver.NXDOMAIN:
        return {"ok": False, "records": [], "message": "DMARC record not found"}
    except dns.resolver.NoAnswer:
        return {"ok": False, "records": [], "message": "No DMARC TXT records found"}
    except Exception as e:
        return {"ok": False, "records": [], "message": f"DNS error: {str(e)}"}


async def generate_dkim_key_pair(domain: str, selector: str, key_dir: str) -> tuple[str, str]:
    os.makedirs(key_dir, exist_ok=True)
    private_key_path = os.path.join(key_dir, f"{domain}.{selector}.private")
    public_key_path = os.path.join(key_dir, f"{domain}.{selector}.public")

    proc = await asyncio.create_subprocess_exec(
        "openssl", "genrsa", "-out", private_key_path, "2048",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to generate RSA key: exit code {proc.returncode}")

    proc = await asyncio.create_subprocess_exec(
        "openssl", "rsa", "-in", private_key_path, "-pubout", "-out", public_key_path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to extract public key: exit code {proc.returncode}")

    with open(public_key_path, "r") as f:
        public_key = f.read()
    with open(private_key_path, "r") as f:
        private_key = f.read()

    return private_key, public_key


def generate_spf_record(ip: str = "0.0.0.0") -> str:
    return f"v=spf1 ip4:{ip} ~all"


def generate_dmarc_record(domain: str, policy: str = "quarantine") -> str:
    return f"v=DMARC1; p={policy}; rua=mailto:dmarc@{domain}; ruf=mailto:dmarc@{domain}; fo=1"


async def verify_domain_ownership(domain: str, expected_token: str) -> bool:
    loop = asyncio.get_event_loop()
    try:
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(domain, "TXT")
        )
        for r in answers:
            txt = str(r).strip('"')
            if expected_token in txt:
                return True
        return False
    except Exception:
        return False
