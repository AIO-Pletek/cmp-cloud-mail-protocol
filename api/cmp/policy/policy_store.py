"""
Policy Engine database store.
Uses asyncpg (same pattern as email_log_service.py).
Tables: policy_global_whitelist, policy_personal_whitelist, policy_cro_accounts, policy_audit_log.
"""
import asyncpg
import json
import os
import uuid
from datetime import datetime
from typing import Optional

DB_HOST = "127.0.0.1"
DB_PORT = 5432
DB_USER = "cmp"
DB_NAME = "cmp"


def _get_db_password() -> str:
    with open("/opt/cmp/.env") as f:
        for line in f:
            k, _, v = line.partition("=")
            if k.strip() == "DB_PASSWORD":
                return v.strip()
    return os.environ.get("DB_PASSWORD", "")


async def _get_conn():
    return await asyncpg.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=_get_db_password(), database=DB_NAME
    )


# ---------------------------------------------------------------------------
# Schema init
# ---------------------------------------------------------------------------

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS policy_global_whitelist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   VARCHAR(64) NOT NULL,
    pattern     VARCHAR(255) NOT NULL,  -- e.g. *.ccb.com or exact@domain.com
    description VARCHAR(500),
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, pattern)
);

CREATE TABLE IF NOT EXISTS policy_personal_whitelist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   VARCHAR(64) NOT NULL,
    account     VARCHAR(255) NOT NULL,  -- internal account email
    allowed     VARCHAR(255) NOT NULL,  -- email or domain pattern
    description VARCHAR(500),
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, account, allowed)
);

CREATE TABLE IF NOT EXISTS policy_cro_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       VARCHAR(64) NOT NULL,
    account_pattern VARCHAR(255) NOT NULL,  -- email or *.branch.domain.com
    branch_name     VARCHAR(255),
    description     VARCHAR(500),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, account_pattern)
);

CREATE TABLE IF NOT EXISTS policy_audit_log (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     VARCHAR(64),
    message_id    VARCHAR(255),
    direction     VARCHAR(10),
    sender        VARCHAR(255),
    recipients    TEXT,  -- JSON array
    action        VARCHAR(20),
    reason_code   VARCHAR(60),
    matched_rule  VARCHAR(500),
    notify_recipient BOOLEAN DEFAULT FALSE,
    bounce_sender    BOOLEAN DEFAULT FALSE,
    attachment_count INT DEFAULT 0,
    has_unprotected_attachment BOOLEAN DEFAULT FALSE,
    policy_version VARCHAR(20) DEFAULT '1.0',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paudit_tenant ON policy_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paudit_ts ON policy_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paudit_sender ON policy_audit_log(sender);
"""


async def init_policy_tables():
    conn = await _get_conn()
    try:
        await conn.execute(CREATE_SQL)
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# Global Whitelist CRUD
# ---------------------------------------------------------------------------

async def list_global_whitelist(tenant_id: str) -> list:
    conn = await _get_conn()
    try:
        rows = await conn.fetch(
            "SELECT * FROM policy_global_whitelist WHERE tenant_id=$1 ORDER BY created_at DESC",
            tenant_id
        )
        return [dict(r) for r in rows]
    finally:
        await conn.close()


async def add_global_whitelist(tenant_id: str, pattern: str, description: str = "") -> dict:
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            """INSERT INTO policy_global_whitelist (tenant_id, pattern, description)
               VALUES ($1, $2, $3)
               ON CONFLICT (tenant_id, pattern) DO UPDATE SET enabled=TRUE, updated_at=NOW()
               RETURNING *""",
            tenant_id, pattern.strip().lower(), description
        )
        return dict(row)
    finally:
        await conn.close()


async def delete_global_whitelist(entry_id: str, tenant_id: str) -> bool:
    conn = await _get_conn()
    try:
        result = await conn.execute(
            "DELETE FROM policy_global_whitelist WHERE id=$1 AND tenant_id=$2",
            uuid.UUID(entry_id), tenant_id
        )
        return result.split()[-1] == "1"
    finally:
        await conn.close()


async def toggle_global_whitelist(entry_id: str, tenant_id: str, enabled: bool) -> dict:
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            """UPDATE policy_global_whitelist SET enabled=$1, updated_at=NOW()
               WHERE id=$2 AND tenant_id=$3 RETURNING *""",
            enabled, uuid.UUID(entry_id), tenant_id
        )
        return dict(row) if row else {}
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# Personal Whitelist CRUD
# ---------------------------------------------------------------------------

async def list_personal_whitelist(tenant_id: str, account: Optional[str] = None) -> list:
    conn = await _get_conn()
    try:
        if account:
            rows = await conn.fetch(
                "SELECT * FROM policy_personal_whitelist WHERE tenant_id=$1 AND account=$2 ORDER BY created_at DESC",
                tenant_id, account.strip().lower()
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM policy_personal_whitelist WHERE tenant_id=$1 ORDER BY account, created_at DESC",
                tenant_id
            )
        return [dict(r) for r in rows]
    finally:
        await conn.close()


async def add_personal_whitelist(tenant_id: str, account: str, allowed: str, description: str = "") -> dict:
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            """INSERT INTO policy_personal_whitelist (tenant_id, account, allowed, description)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (tenant_id, account, allowed) DO UPDATE SET enabled=TRUE, updated_at=NOW()
               RETURNING *""",
            tenant_id, account.strip().lower(), allowed.strip().lower(), description
        )
        return dict(row)
    finally:
        await conn.close()


async def delete_personal_whitelist(entry_id: str, tenant_id: str) -> bool:
    conn = await _get_conn()
    try:
        result = await conn.execute(
            "DELETE FROM policy_personal_whitelist WHERE id=$1 AND tenant_id=$2",
            uuid.UUID(entry_id), tenant_id
        )
        return result.split()[-1] == "1"
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# CRO Accounts CRUD
# ---------------------------------------------------------------------------

async def list_cro_accounts(tenant_id: str) -> list:
    conn = await _get_conn()
    try:
        rows = await conn.fetch(
            "SELECT * FROM policy_cro_accounts WHERE tenant_id=$1 ORDER BY created_at DESC",
            tenant_id
        )
        return [dict(r) for r in rows]
    finally:
        await conn.close()


async def add_cro_account(tenant_id: str, account_pattern: str, branch_name: str = "", description: str = "") -> dict:
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            """INSERT INTO policy_cro_accounts (tenant_id, account_pattern, branch_name, description)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (tenant_id, account_pattern) DO UPDATE SET enabled=TRUE, updated_at=NOW()
               RETURNING *""",
            tenant_id, account_pattern.strip().lower(), branch_name, description
        )
        return dict(row)
    finally:
        await conn.close()


async def delete_cro_account(entry_id: str, tenant_id: str) -> bool:
    conn = await _get_conn()
    try:
        result = await conn.execute(
            "DELETE FROM policy_cro_accounts WHERE id=$1 AND tenant_id=$2",
            uuid.UUID(entry_id), tenant_id
        )
        return result.split()[-1] == "1"
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

async def write_audit_log(
    tenant_id: str,
    message_id: str,
    direction: str,
    sender: str,
    recipients: list,
    action: str,
    reason_code: str,
    matched_rule: str,
    notify_recipient: bool = False,
    bounce_sender: bool = False,
    attachment_count: int = 0,
    has_unprotected_attachment: bool = False,
    policy_version: str = "1.0",
) -> int:
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            """INSERT INTO policy_audit_log
               (tenant_id, message_id, direction, sender, recipients, action, reason_code,
                matched_rule, notify_recipient, bounce_sender, attachment_count,
                has_unprotected_attachment, policy_version)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               RETURNING id""",
            tenant_id, message_id, direction, sender,
            json.dumps(recipients), action, reason_code,
            matched_rule, notify_recipient, bounce_sender,
            attachment_count, has_unprotected_attachment, policy_version
        )
        return row["id"]
    finally:
        await conn.close()


async def list_audit_log(tenant_id: str, limit: int = 100, offset: int = 0) -> list:
    conn = await _get_conn()
    try:
        rows = await conn.fetch(
            """SELECT * FROM policy_audit_log WHERE tenant_id=$1
               ORDER BY created_at DESC LIMIT $2 OFFSET $3""",
            tenant_id, limit, offset
        )
        return [dict(r) for r in rows]
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# Load config for PolicyEngine from DB
# ---------------------------------------------------------------------------

async def load_policy_config(tenant_id: str) -> dict:
    """
    Load all whitelist/CRO data for building a PolicyEngineConfig.
    Returns dict with keys: global_whitelist_patterns, personal_whitelist, cro_patterns.
    """
    conn = await _get_conn()
    try:
        gw_rows = await conn.fetch(
            "SELECT pattern FROM policy_global_whitelist WHERE tenant_id=$1 AND enabled=TRUE",
            tenant_id
        )
        pw_rows = await conn.fetch(
            "SELECT account, allowed FROM policy_personal_whitelist WHERE tenant_id=$1 AND enabled=TRUE",
            tenant_id
        )
        cro_rows = await conn.fetch(
            "SELECT account_pattern FROM policy_cro_accounts WHERE tenant_id=$1 AND enabled=TRUE",
            tenant_id
        )
    finally:
        await conn.close()

    global_patterns = [r["pattern"] for r in gw_rows]

    personal: dict = {}
    for r in pw_rows:
        acct = r["account"]
        if acct not in personal:
            personal[acct] = []
        personal[acct].append(r["allowed"])

    cro_patterns = [r["account_pattern"] for r in cro_rows]

    return {
        "global_whitelist_patterns": global_patterns,
        "personal_whitelist": personal,
        "cro_patterns": cro_patterns,
    }

async def save_policy_settings(tenant_id: str, settings: dict) -> dict:
    """Save policy-level settings to policy_settings table."""
    import json as _json
    conn = await _get_conn()
    try:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS policy_settings (
                tenant_id   VARCHAR(64) PRIMARY KEY,
                settings    JSONB NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        await conn.execute(
            "INSERT INTO policy_settings (tenant_id, settings, updated_at) "
            "VALUES ($1, $2::jsonb, NOW()) "
            "ON CONFLICT (tenant_id) DO UPDATE SET settings=$2::jsonb, updated_at=NOW()",
            tenant_id, _json.dumps(settings)
        )
        return settings
    finally:
        await conn.close()


async def load_policy_settings(tenant_id: str) -> dict:
    """Load policy-level settings, fallback to defaults."""
    import json as _json
    defaults = {
        "require_attachment_password": True,
        "fail_closed_on_inspection_failure": True,
        "priority_order": ["attachment_security", "cro", "personal_whitelist", "global_whitelist", "default"],
        "inbound_default_action": "quarantine",
        "outbound_default_action": "bounce",
        "notify_recipient_on_quarantine": True,
        "bounce_message": "Email not permitted: recipient not in approved whitelist.",
        "quarantine_message": "Email held for review: sender not in approved whitelist.",
        "description": "",
    }
    conn = await _get_conn()
    try:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS policy_settings (
                tenant_id   VARCHAR(64) PRIMARY KEY,
                settings    JSONB NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        row = await conn.fetchrow(
            "SELECT settings FROM policy_settings WHERE tenant_id=$1", tenant_id
        )
        if row:
            saved = _json.loads(row["settings"])
            defaults.update(saved)
        return defaults
    except Exception:
        return defaults
    finally:
        await conn.close()


async def toggle_personal_whitelist(entry_id: str, tenant_id: str, enabled: bool) -> dict:
    """Enable/disable a personal whitelist entry."""
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            "UPDATE policy_personal_whitelist SET enabled=$1, updated_at=NOW() "
            "WHERE id=$2 AND tenant_id=$3 RETURNING *",
            enabled, uuid.UUID(entry_id), tenant_id
        )
        return dict(row) if row else {}
    finally:
        await conn.close()


async def update_personal_whitelist(entry_id: str, tenant_id: str, allowed: str, description: str) -> dict:
    """Update allowed pattern and description for a personal whitelist entry."""
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            "UPDATE policy_personal_whitelist SET allowed=$1, description=$2, updated_at=NOW() "
            "WHERE id=$3 AND tenant_id=$4 RETURNING *",
            allowed.strip().lower(), description, uuid.UUID(entry_id), tenant_id
        )
        return dict(row) if row else {}
    finally:
        await conn.close()


async def update_global_whitelist(entry_id: str, tenant_id: str, pattern: str, description: str) -> dict:
    """Update pattern and description for a global whitelist entry."""
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            "UPDATE policy_global_whitelist SET pattern=$1, description=$2, updated_at=NOW() "
            "WHERE id=$3 AND tenant_id=$4 RETURNING *",
            pattern.strip().lower(), description, uuid.UUID(entry_id), tenant_id
        )
        return dict(row) if row else {}
    finally:
        await conn.close()


async def update_cro_account(entry_id: str, tenant_id: str, account_pattern: str, branch_name: str, description: str) -> dict:
    """Update a CRO account entry."""
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            "UPDATE policy_cro_accounts SET account_pattern=$1, branch_name=$2, description=$3, updated_at=NOW() "
            "WHERE id=$4 AND tenant_id=$5 RETURNING *",
            account_pattern.strip().lower(), branch_name, description, uuid.UUID(entry_id), tenant_id
        )
        return dict(row) if row else {}
    finally:
        await conn.close()
