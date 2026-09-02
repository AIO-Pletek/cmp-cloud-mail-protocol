"""Sync per-domain attachment_password_required flags to the rspamd map file.

Map semantics: file lists domains where the rule is DISABLED.
Default (domain absent from file) = rule enforced, preserving current behaviour.
"""
import os
import tempfile

MAP_FILE = "/etc/rspamd/maps.d/cmp_attachment_password_disabled.map"


async def sync_attachment_password_map() -> dict:
    from cmp.policy.domain_policy_store import init_domain_policy_tables, _conn

    await init_domain_policy_tables()
    conn = await _conn()
    try:
        rows = await conn.fetch(
            "SELECT domain_name FROM domains "
            "WHERE is_active=TRUE AND attachment_password_required=FALSE"
        )
        disabled = sorted({r["domain_name"].strip().lower() for r in rows if r["domain_name"]})
    finally:
        await conn.close()

    os.makedirs(os.path.dirname(MAP_FILE), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(MAP_FILE), prefix=".cmp_ap_")
    try:
        with os.fdopen(fd, "w") as f:
            for dom in disabled:
                f.write(dom + "\n")
        os.chmod(tmp, 0o644)
        os.replace(tmp, MAP_FILE)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return {"synced": True, "disabled_domains": disabled, "map_file": MAP_FILE}
