from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from cmp.database import get_db
from cmp.models.audit_log import AuditLog
from cmp.middleware.auth import get_current_user, require_admin
from cmp.models.tenant import Tenant

router = APIRouter(prefix="/api/v1/audit", tags=["Audit Log"])


@router.get("/")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: str | None = None,
    user_email: str | None = None,
    resource_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    admin: Tenant = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List audit logs with pagination and filters. Admin only."""
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    filters = []
    if action:
        filters.append(AuditLog.action.ilike(f"%{action}%"))
    if user_email:
        filters.append(AuditLog.user_email.ilike(f"%{user_email}%"))
    if resource_type:
        filters.append(AuditLog.resource_type.ilike(f"%{resource_type}%"))
    if date_from:
        from datetime import datetime
        filters.append(AuditLog.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        from datetime import datetime
        filters.append(AuditLog.created_at <= datetime.fromisoformat(date_to))

    for f in filters:
        query = query.where(f)
        count_query = count_query.where(f)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    query = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(per_page)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "items": [
            {
                "id": item.id,
                "tenant_id": item.tenant_id,
                "user_email": item.user_email,
                "action": item.action,
                "resource_type": item.resource_type,
                "resource_id": item.resource_id,
                "details_json": item.details_json,
                "ip_address": item.ip_address,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
