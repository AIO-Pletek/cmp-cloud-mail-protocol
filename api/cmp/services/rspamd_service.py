import os
import asyncio
from cmp.config import settings


async def _write_rspamd_config(domain: str, rule_type: str, entries: list[str]) -> None:
    override_dir = settings.RSPAMD_OVERRIDE_DIR
    os.makedirs(override_dir, exist_ok=True)

    if rule_type == "whitelist":
        filename = f"{domain}_whitelist.conf"
        content_lines = [
            "multimap {",
            f'  WL_FROM_{domain.replace(".", "_")} {{',
            '    type = "from"',
            '    filter = "email:domain"',
            '    action = "accept"',
            "    map = [",
        ]
        for entry in entries:
            content_lines.append(f'      "{entry}",')
        content_lines += ["    ]", "  }", "}"]
    elif rule_type == "blacklist":
        filename = f"{domain}_blacklist.conf"
        content_lines = [
            "multimap {",
            f'  BL_FROM_{domain.replace(".", "_")} {{',
            '    type = "from"',
            '    filter = "email:domain"',
            '    action = "reject"',
            "    map = [",
        ]
        for entry in entries:
            content_lines.append(f'      "{entry}",')
        content_lines += ["    ]", "  }", "}"]
    else:
        filename = f"{domain}_content.conf"
        content_lines = entries

    filepath = os.path.join(override_dir, filename)
    with open(filepath, "w") as f:
        f.write("\n".join(content_lines) + "\n")

    await reload_rspamd()


async def add_whitelist(domain: str, pattern: str) -> str:
    existing = await list_rules(domain)
    whitelist_entries = [r["pattern"] for r in existing if r["rule_type"] == "whitelist"]
    if pattern not in whitelist_entries:
        whitelist_entries.append(pattern)
    await _write_rspamd_config(domain, "whitelist", whitelist_entries)
    return f"Added {pattern} to whitelist for {domain}"


async def add_blacklist(domain: str, pattern: str) -> str:
    existing = await list_rules(domain)
    blacklist_entries = [r["pattern"] for r in existing if r["rule_type"] == "blacklist"]
    if pattern not in blacklist_entries:
        blacklist_entries.append(pattern)
    await _write_rspamd_config(domain, "blacklist", blacklist_entries)
    return f"Added {pattern} to blacklist for {domain}"


async def remove_rule(domain: str, rule_type: str, pattern: str) -> str:
    existing = await list_rules(domain)
    remaining = [r["pattern"] for r in existing if r["rule_type"] == rule_type and r["pattern"] != pattern]
    await _write_rspamd_config(domain, rule_type, remaining)
    return f"Removed {pattern} from {rule_type} for {domain}"


async def list_rules(domain: str) -> list[dict]:
    override_dir = settings.RSPAMD_OVERRIDE_DIR
    rules = []
    if not os.path.isdir(override_dir):
        return rules

    for filename in os.listdir(override_dir):
        if not filename.startswith(domain.replace(".", "_")) and not filename.startswith(domain):
            continue
        filepath = os.path.join(override_dir, filename)
        with open(filepath, "r") as f:
            content = f.read()

        if "whitelist" in filename:
            rule_type = "whitelist"
        elif "blacklist" in filename:
            rule_type = "blacklist"
        else:
            rule_type = "content_filter"

        import re
        patterns = re.findall(r'"([^"]+)"', content)
        for pat in patterns:
            if pat not in ("from", "email:domain", "accept", "reject"):
                rules.append({"rule_type": rule_type, "pattern": pat, "domain": domain})

    return rules


async def add_content_filter(domain: str, regex: str, action: str) -> str:
    override_dir = settings.RSPAMD_OVERRIDE_DIR
    os.makedirs(override_dir, exist_ok=True)
    filename = f"{domain.replace('.', '_')}_re.conf"
    filepath = os.path.join(override_dir, filename)

    existing_content = ""
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            existing_content = f.read()

    new_entry = f'RE_MODULE {{\n  re = "{regex}";\n  action = "{action}";\n}}\n'
    with open(filepath, "a") as f:
        f.write(new_entry)

    await reload_rspamd()
    return f"Added content filter for {domain}: {regex} -> {action}"


async def reload_rspamd() -> str:
    proc = await asyncio.create_subprocess_exec(
        "systemctl", "reload", "rspamd",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Rspamd reload failed: {stderr.decode()}")
    return stdout.decode()
