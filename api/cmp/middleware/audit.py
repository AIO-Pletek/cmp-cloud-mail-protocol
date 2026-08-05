import json
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from cmp.models.audit_log import AuditLog


async def log_audit(
    db: AsyncSession,
    tenant_id: str | None,
    user_email: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    audit = AuditLog(
        tenant_id=tenant_id,
        user_email=user_email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details_json=json.dumps(details) if details else None,
        ip_address=ip_address,
    )
    db.add(audit)
    await db.flush()
    return audit
