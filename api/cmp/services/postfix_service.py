import os
import asyncio
import re
from datetime import datetime, timedelta
from cmp.config import settings


async def add_virtual_domain(domain_name: str) -> None:
    virtual_map = settings.POSTFIX_VIRTUAL_MAP
    os.makedirs(os.path.dirname(virtual_map), exist_ok=True)

    line = f"{domain_name}    {domain_name}\n"

    existing = ""
    if os.path.exists(virtual_map):
        with open(virtual_map, "r") as f:
            existing = f.read()

    if domain_name not in existing:
        with open(virtual_map, "a") as f:
            f.write(line)

    await reload_postfix()


async def remove_virtual_domain(domain_name: str) -> None:
    virtual_map = settings.POSTFIX_VIRTUAL_MAP
    if not os.path.exists(virtual_map):
        return

    with open(virtual_map, "r") as f:
        lines = f.readlines()

    with open(virtual_map, "w") as f:
        for line in lines:
            if not line.strip().startswith(domain_name):
                f.write(line)

    await reload_postfix()


async def reload_postfix() -> str:
    proc = await asyncio.create_subprocess_exec(
        "systemctl", "reload", "postfix",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Postfix reload failed: {stderr.decode()}")
    return stdout.decode()


async def get_queue_status() -> str:
    proc = await asyncio.create_subprocess_exec(
        "postqueue", "-p",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"postqueue failed: {stderr.decode()}")
    return stdout.decode()


async def flush_queue() -> str:
    proc = await asyncio.create_subprocess_exec(
        "postfix", "flush",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"postfix flush failed: {stderr.decode()}")
    return stdout.decode()


async def get_mail_stats() -> dict:
    mail_log = "/var/log/mail.log"
    stats = {
        "total_delivered": 0,
        "total_bounced": 0,
        "total_deferred": 0,
        "total_rejected": 0,
        "by_domain": {},
    }

    if not os.path.exists(mail_log):
        return stats

    loop = asyncio.get_event_loop()

    def _parse_log():
        result = {
            "total_delivered": 0,
            "total_bounced": 0,
            "total_deferred": 0,
            "total_rejected": 0,
            "by_domain": {},
        }
        with open(mail_log, "r") as f:
            for line in f:
                if "status=sent" in line:
                    result["total_delivered"] += 1
                    match = re.search(r"to=<[^@]+@([^>]+)>", line)
                    if match:
                        domain = match.group(1)
                        result["by_domain"].setdefault(domain, {"delivered": 0, "bounced": 0, "deferred": 0, "rejected": 0})
                        result["by_domain"][domain]["delivered"] += 1
                elif "status=bounced" in line:
                    result["total_bounced"] += 1
                elif "status=deferred" in line:
                    result["total_deferred"] += 1
                elif "status=rejected" in line:
                    result["total_rejected"] += 1
        return result

    return await loop.run_in_executor(None, _parse_log)
