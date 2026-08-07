"""Whitelist/Blocklist management service."""
import asyncio
import os
from datetime import datetime


def get_db_password():
    with open("/opt/cmp/.env") as f:
        for line in f:
            key, _, value = line.partition("=")
            if key.strip() == "DB_PASSWORD":
                return value.strip()
    return os.environ.get("DB_PASSWORD", "")


async def get_db():
    import asyncpg
    password = get_db_password()
    return await asyncpg.connect(f"postgresql://cmp:***@127.0.0.1:5432/cmp")


async def init_lists_table():
    """Create whitelist/blocklist tables."""
    conn = await get_db()
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS access_lists (
            id SERIAL PRIMARY KEY,
            tenant_id VARCHAR(36),
            domain_id VARCHAR(36),
            list_type VARCHAR(10) NOT NULL,
            entry_type VARCHAR(10) NOT NULL,
            value VARCHAR(255) NOT NULL,
            reason VARCHAR(500),
            enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_by VARCHAR(255)
        );
        CREATE INDEX IF NOT EXISTS idx_access_lists_tenant ON access_lists(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_access_lists_domain ON access_lists(domain_id);
        CREATE INDEX IF NOT EXISTS idx_access_lists_type ON access_lists(list_type, entry_type);
        CREATE INDEX IF NOT EXISTS idx_access_lists_value ON access_lists(value);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_access_lists_unique ON access_lists(list_type, entry_type, value, COALESCE(domain_id, ''));
    """)
    await conn.close()


async def get_lists(tenant_id=None, domain_id=None, list_type=None, entry_type=None):
    """Get whitelist/blocklist entries."""
    conn = await get_db()
    conditions = []
    params = []
    idx = 1

    if tenant_id:
        conditions.append(f"(tenant_id = ${idx} OR tenant_id IS NULL)")
        params.append(tenant_id)
        idx += 1
    if domain_id:
        conditions.append(f"(domain_id = ${idx} OR domain_id IS NULL)")
        params.append(domain_id)
        idx += 1
    if list_type:
        conditions.append(f"list_type = ${idx}")
        params.append(list_type)
        idx += 1
    if entry_type:
        conditions.append(f"entry_type = ${idx}")
        params.append(entry_type)
        idx += 1

    where = " AND ".join(conditions) if conditions else "1=1"
    rows = await conn.fetch(
        f"SELECT * FROM access_lists WHERE {where} ORDER BY created_at DESC",
        *params
    )
    await conn.close()
    return [dict(r) for r in rows]


async def add_entry(list_type, entry_type, value, tenant_id=None, domain_id=None, reason=None, created_by=None):
    """Add a whitelist/blocklist entry."""
    conn = await get_db()
    try:
        row = await conn.fetchrow("""
            INSERT INTO access_lists (list_type, entry_type, value, tenant_id, domain_id, reason, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        """, list_type, entry_type, value.lower().strip(), tenant_id, domain_id, reason, created_by)
        await conn.close()
        return dict(row)
    except Exception as e:
        await conn.close()
        if "unique" in str(e).lower():
            raise ValueError("Entry already exists")
        raise


async def remove_entry(entry_id):
    """Remove a whitelist/blocklist entry."""
    conn = await get_db()
    result = await conn.execute("DELETE FROM access_lists WHERE id = $1", entry_id)
    await conn.close()
    return "DELETE" in result


async def toggle_entry(entry_id, enabled):
    """Enable/disable a whitelist/blocklist entry."""
    conn = await get_db()
    row = await conn.fetchrow(
        "UPDATE access_lists SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        enabled, entry_id
    )
    await conn.close()
    return dict(row) if row else None


async def is_allowed(sender, recipient, source_ip=None):
    """Check if a message should be allowed based on whitelist/blocklist."""
    conn = await get_db()

    sender_domain = sender.split("@")[-1] if "@" in sender else ""
    recipient_domain = recipient.split("@")[-1] if "@" in recipient else ""

    # Check blocklist first (takes priority)
    block_conditions = []
    block_params = []
    idx = 1

    # Block by email
    block_conditions.append(f"(entry_type = 'email' AND value = ${idx} AND enabled = true)")
    block_params.append(sender.lower())
    idx += 1

    # Block by domain
    if sender_domain:
        block_conditions.append(f"(entry_type = 'domain' AND value = ${idx} AND enabled = true)")
        block_params.append(sender_domain.lower())
        idx += 1

    # Block by IP
    if source_ip:
        block_conditions.append(f"(entry_type = 'ip' AND value = ${idx} AND enabled = true)")
        block_params.append(source_ip)
        idx += 1

    block_where = " OR ".join(block_conditions)
    blocked = await conn.fetchval(
        f"SELECT EXISTS(SELECT 1 FROM access_lists WHERE list_type = 'block' AND ({block_where}))",
        *block_params
    )

    if blocked:
        await conn.close()
        return {"allowed": False, "reason": "blocked"}

    # Check whitelist
    white_conditions = []
    white_params = []
    idx = 1

    white_conditions.append(f"(entry_type = 'email' AND value = ${idx} AND enabled = true)")
    white_params.append(sender.lower())
    idx += 1

    if sender_domain:
        white_conditions.append(f"(entry_type = 'domain' AND value = ${idx} AND enabled = true)")
        white_params.append(sender_domain.lower())
        idx += 1

    if source_ip:
        white_conditions.append(f"(entry_type = 'ip' AND value = ${idx} AND enabled = true)")
        white_params.append(source_ip)
        idx += 1

    white_where = " OR ".join(white_conditions)
    whitelisted = await conn.fetchval(
        f"SELECT EXISTS(SELECT 1 FROM access_lists WHERE list_type = 'white' AND ({white_where}))",
        *white_params
    )

    await conn.close()

    if whitelisted:
        return {"allowed": True, "reason": "whitelisted"}
    return {"allowed": True, "reason": "default"}


async def get_stats():
    """Get whitelist/blocklist statistics."""
    conn = await get_db()
    total = await conn.fetchval("SELECT COUNT(*) FROM access_lists")
    whitelist = await conn.fetchval("SELECT COUNT(*) FROM access_lists WHERE list_type = 'white'")
    blocklist = await conn.fetchval("SELECT COUNT(*) FROM access_lists WHERE list_type = 'block'")
    by_type = await conn.fetch("""
        SELECT list_type, entry_type, COUNT(*) as count
        FROM access_lists
        GROUP BY list_type, entry_type
        ORDER BY list_type, entry_type
    """)
    await conn.close()
    return {
        "total": total,
        "whitelist": whitelist,
        "blocklist": blocklist,
        "by_type": [dict(r) for r in by_type],
    }


async def export_for_rspamd():
    """Export whitelist/blocklist for Rspamd integration."""
    conn = await get_db()

    whitelist_domains = await conn.fetch(
        "SELECT value FROM access_lists WHERE list_type = 'white' AND entry_type = 'domain' AND enabled = true"
    )
    whitelist_ips = await conn.fetch(
        "SELECT value FROM access_lists WHERE list_type = 'white' AND entry_type = 'ip' AND enabled = true"
    )
    blocklist_domains = await conn.fetch(
        "SELECT value FROM access_lists WHERE list_type = 'block' AND entry_type = 'domain' AND enabled = true"
    )
    blocklist_ips = await conn.fetch(
        "SELECT value FROM access_lists WHERE list_type = 'block' AND entry_type = 'ip' AND enabled = true"
    )

    await conn.close()

    return {
        "whitelist_domains": [r["value"] for r in whitelist_domains],
        "whitelist_ips": [r["value"] for r in whitelist_ips],
        "blocklist_domains": [r["value"] for r in blocklist_domains],
        "blocklist_ips": [r["value"] for r in blocklist_ips],
    }


async def sync_to_rspamd():
    """Sync whitelist/blocklist to Rspamd maps."""
    data = await export_for_rspamd()

    # Write Rspamd whitelist map
    with open("/etc/rspamd/local.d/whitelist.map", "w") as f:
        for domain in data["whitelist_domains"]:
            f.write(f"*@{domain}\n")
        for email in data.get("whitelist_emails", []):
            f.write(f"{email}\n")

    # Write Rspamd blocklist map
    with open("/etc/rspamd/local.d/blocklist.map", "w") as f:
        for domain in data["blocklist_domains"]:
            f.write(f"*@{domain}\n")
        for ip in data["blocklist_ips"]:
            f.write(f"{ip}\n")

    # Write IP whitelist for Postfix
    with open("/etc/postfix/client_whitelist", "w") as f:
        f.write("# Auto-generated by CMP\n")
        for ip in data["whitelist_ips"]:
            f.write(f"{ip}  OK\n")
    os.system("postmap /etc/postfix/client_whitelist 2>/dev/null")

    # Write IP blocklist for Postfix
    with open("/etc/postfix/client_blocklist", "w") as f:
        f.write("# Auto-generated by CMP\n")
        for ip in data["blocklist_ips"]:
            f.write(f"{ip}  REJECT Blocked by administrator\n")
    os.system("postmap /etc/postfix/client_blocklist 2>/dev/null")

    return {"synced": True, "counts": {k: len(v) for k, v in data.items()}}
