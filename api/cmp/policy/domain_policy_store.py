"""Tenant/global domain allow/block policy storage."""
from __future__ import annotations

import json
import os
import uuid
import asyncpg

DB_HOST = "127.0.0.1"
DB_PORT = 5432
DB_USER = "cmp"
DB_NAME = "cmp"


def _get_db_password() -> str:
    try:
        with open("/opt/cmp/.env") as f:
            for line in f:
                k, _, v = line.partition("=")
                if k.strip() == "DB_PASSWORD":
                    return v.strip()
    except OSError:
        pass
    return os.environ.get("DB_PASSWORD", "")


async def _conn():
    return await asyncpg.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                                 password=_get_db_password(), database=DB_NAME)


CREATE_SQL = """
CREATE TABLE IF NOT EXISTS policy_domain_settings (
    tenant_id VARCHAR(64) PRIMARY KEY,
    mode VARCHAR(20) NOT NULL DEFAULT 'allow_all',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT policy_domain_mode_check CHECK (mode IN ('allow_all','allowlist'))
);
CREATE TABLE IF NOT EXISTS policy_domain_global_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    mode VARCHAR(20) NOT NULL DEFAULT 'allow_all',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT policy_global_domain_mode_check CHECK (mode IN ('allow_all','allowlist'))
);
CREATE TABLE IF NOT EXISTS policy_domain_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope VARCHAR(10) NOT NULL,
    tenant_id VARCHAR(64),
    action VARCHAR(10) NOT NULL,
    pattern VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT policy_domain_scope_check CHECK (scope IN ('global','tenant')),
    CONSTRAINT policy_domain_action_check CHECK (action IN ('allow','block')),
    CONSTRAINT policy_domain_scope_tenant_check CHECK ((scope='global' AND tenant_id IS NULL) OR (scope='tenant' AND tenant_id IS NOT NULL)),
    UNIQUE (scope, tenant_id, action, pattern)
);
CREATE INDEX IF NOT EXISTS idx_policy_domain_rules_lookup ON policy_domain_rules(scope, tenant_id, enabled, action);
"""


async def init_domain_policy_tables():
    conn = await _conn()
    try:
        await conn.execute(CREATE_SQL)
        await conn.execute("INSERT INTO policy_domain_global_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING")
    finally:
        await conn.close()


def _row(row):
    return dict(row) if row else None


async def get_settings(tenant_id: str) -> dict:
    await init_domain_policy_tables()
    conn = await _conn()
    try:
        row = await conn.fetchrow("SELECT tenant_id, mode, enabled, updated_at FROM policy_domain_settings WHERE tenant_id=$1", tenant_id)
        return _row(row) or {"tenant_id": tenant_id, "mode": "allow_all", "enabled": True}
    finally:
        await conn.close()


async def save_settings(tenant_id: str, mode: str, enabled: bool = True) -> dict:
    if mode not in ("allow_all", "allowlist"):
        raise ValueError("mode must be allow_all or allowlist")
    await init_domain_policy_tables()
    conn = await _conn()
    try:
        row = await conn.fetchrow("""INSERT INTO policy_domain_settings (tenant_id, mode, enabled, updated_at)
            VALUES ($1,$2,$3,NOW()) ON CONFLICT (tenant_id) DO UPDATE SET mode=$2, enabled=$3, updated_at=NOW()
            RETURNING tenant_id, mode, enabled, updated_at""", tenant_id, mode, enabled)
        return _row(row)
    finally:
        await conn.close()


async def get_global_settings() -> dict:
    await init_domain_policy_tables()
    conn = await _conn()
    try:
        row = await conn.fetchrow("SELECT mode, enabled, updated_at FROM policy_domain_global_settings WHERE id=TRUE")
        return _row(row) or {"mode": "allow_all", "enabled": True}
    finally:
        await conn.close()


async def save_global_settings(mode: str, enabled: bool = True) -> dict:
    if mode not in ("allow_all", "allowlist"):
        raise ValueError("mode must be allow_all or allowlist")
    await init_domain_policy_tables()
    conn = await _conn()
    try:
        row = await conn.fetchrow("""INSERT INTO policy_domain_global_settings (id, mode, enabled, updated_at)
            VALUES (TRUE,$1,$2,NOW()) ON CONFLICT (id) DO UPDATE SET mode=$1, enabled=$2, updated_at=NOW()
            RETURNING mode, enabled, updated_at""", mode, enabled)
        return _row(row)
    finally:
        await conn.close()


async def list_rules(scope: str, tenant_id: str | None = None) -> list:
    await init_domain_policy_tables()
    if scope not in ("global", "tenant"):
        raise ValueError("invalid scope")
    conn = await _conn()
    try:
        if scope == "global":
            rows = await conn.fetch("SELECT * FROM policy_domain_rules WHERE scope='global' ORDER BY action, created_at DESC")
        else:
            rows = await conn.fetch("SELECT * FROM policy_domain_rules WHERE scope='tenant' AND tenant_id=$1 ORDER BY action, created_at DESC", tenant_id)
        return [dict(r) for r in rows]
    finally:
        await conn.close()


async def add_rule(scope: str, tenant_id: str | None, action: str, pattern: str, description: str = "") -> dict:
    if scope not in ("global", "tenant") or action not in ("allow", "block"):
        raise ValueError("scope/action invalid")
    pattern = pattern.strip().lower()
    if not pattern or len(pattern) > 255:
        raise ValueError("pattern is required")
    if scope == "global":
        tenant_id = None
    elif not tenant_id:
        raise ValueError("tenant_id is required for tenant scope")
    await init_domain_policy_tables()
    conn = await _conn()
    try:
        row = await conn.fetchrow("""INSERT INTO policy_domain_rules (scope, tenant_id, action, pattern, description)
            VALUES ($1,$2,$3,$4,$5) ON CONFLICT (scope, tenant_id, action, pattern)
            DO UPDATE SET enabled=TRUE, description=$5, updated_at=NOW() RETURNING *""",
            scope, tenant_id, action, pattern, description)
        return _row(row)
    finally:
        await conn.close()


async def delete_rule(rule_id: str, scope: str, tenant_id: str | None = None) -> bool:
    await init_domain_policy_tables()
    conn = await _conn()
    try:
        if scope == "global":
            result = await conn.execute("DELETE FROM policy_domain_rules WHERE id=$1 AND scope='global'", uuid.UUID(rule_id))
        else:
            result = await conn.execute("DELETE FROM policy_domain_rules WHERE id=$1 AND scope='tenant' AND tenant_id=$2", uuid.UUID(rule_id), tenant_id)
        return result.split()[-1] == "1"
    finally:
        await conn.close()


async def load_domain_policy(tenant_id: str) -> dict:
    """Return a serializable snapshot used by both API evaluation and SMTP daemon."""
    await init_domain_policy_tables()
    conn = await _conn()
    try:
        tenant = await conn.fetchrow("SELECT mode, enabled FROM policy_domain_settings WHERE tenant_id=$1", tenant_id)
        glob = await conn.fetchrow("SELECT mode, enabled FROM policy_domain_global_settings WHERE id=TRUE")
        rows = await conn.fetch("""SELECT scope, action, pattern FROM policy_domain_rules
            WHERE enabled=TRUE AND (scope='global' OR (scope='tenant' AND tenant_id=$1))""", tenant_id)
    finally:
        await conn.close()
    result = {
        "tenant_domain_mode": (tenant["mode"] if tenant else "allow_all"),
        "tenant_domain_policy_enabled": (bool(tenant["enabled"]) if tenant else True),
        "global_domain_mode": (glob["mode"] if glob else "allow_all"),
        "global_domain_policy_enabled": (bool(glob["enabled"]) if glob else True),
        "tenant_domain_allow_patterns": [], "tenant_domain_block_patterns": [],
        "global_domain_allow_patterns": [], "global_domain_block_patterns": [],
    }
    for row in rows:
        key = f"{row['scope']}_domain_{row['action']}_patterns"
        result[key].append(row["pattern"])
    return result


async def list_active_tenant_domains() -> list[dict]:
    """Resolve SMTP messages to the owning tenant without trusting client input."""
    await init_domain_policy_tables()
    conn = await _conn()
    try:
        rows = await conn.fetch("SELECT tenant_id, domain_name FROM domains WHERE is_active=TRUE")
        return [dict(r) for r in rows]
    finally:
        await conn.close()
