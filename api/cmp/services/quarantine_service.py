import os
import subprocess
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from cmp.models.quarantine import Quarantine, QuarantineStatus
from cmp.models.domain import Domain
from cmp.config import settings


async def list_quarantined(
    db: AsyncSession,
    tenant_id: str,
    domain_id: str | None = None,
    status_filter: str | None = None,
    search: str | None = None,
    page: int = 1,
    per_page: int = 25,
) -> dict:
    query = select(Quarantine).join(Domain, Quarantine.domain_id == Domain.id).where(
        Domain.tenant_id == tenant_id
    )
    if domain_id:
        query = query.where(Quarantine.domain_id == domain_id)
    if status_filter:
        query = query.where(Quarantine.status == status_filter)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (Quarantine.sender.ilike(search_pattern)) |
            (Quarantine.recipient.ilike(search_pattern)) |
            (Quarantine.subject.ilike(search_pattern))
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    query = query.order_by(Quarantine.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    items = list(result.scalars().all())

    return {"items": items, "total": total, "page": page, "per_page": per_page, "pages": (total + per_page - 1) // per_page}


async def get_detail(db: AsyncSession, quarantine_id: str) -> Quarantine:
    result = await db.execute(select(Quarantine).where(Quarantine.id == quarantine_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quarantine entry not found")
    return item


async def release_quarantine(db: AsyncSession, quarantine_id: str) -> Quarantine:
    result = await db.execute(select(Quarantine).where(Quarantine.id == quarantine_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quarantine entry not found")
    if item.status != QuarantineStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending items can be released")

    # Re-inject via sendmail if raw file exists
    if item.raw_path and os.path.exists(item.raw_path):
        try:
            proc = await asyncio.create_subprocess_exec(
                "sendmail", "-f", item.sender, item.recipient,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            with open(item.raw_path, "rb") as f:
                raw_data = f.read()
            await proc.communicate(input=raw_data)
        except Exception:
            pass

    item.status = QuarantineStatus.released
    item.released_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(item)
    return item


async def delete_quarantine(db: AsyncSession, quarantine_id: str) -> Quarantine:
    result = await db.execute(select(Quarantine).where(Quarantine.id == quarantine_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quarantine entry not found")

    # Delete raw file if exists
    if item.raw_path and os.path.exists(item.raw_path):
        os.remove(item.raw_path)

    item.status = QuarantineStatus.deleted
    await db.flush()
    await db.refresh(item)
    return item


async def bulk_action(db: AsyncSession, ids: list[str], action: str) -> dict:
    success = 0
    failed = 0
    for qid in ids:
        try:
            if action == "release":
                await release_quarantine(db, qid)
            elif action == "delete":
                await delete_quarantine(db, qid)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown action: {action}")
            success += 1
        except HTTPException:
            failed += 1
    return {"success": success, "failed": failed}


async def cleanup_expired(db: AsyncSession, days: int = 30) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(Quarantine).where(
            Quarantine.created_at < cutoff,
            Quarantine.status.in_([QuarantineStatus.deleted, QuarantineStatus.expired]),
        )
    )
    items = list(result.scalars().all())
    count = 0
    for item in items:
        if item.raw_path and os.path.exists(item.raw_path):
            os.remove(item.raw_path)
        await db.delete(item)
        count += 1
    await db.flush()
    return count


async def get_stats(db: AsyncSession, tenant_id: str) -> dict:
    base_query = select(Quarantine).join(Domain, Quarantine.domain_id == Domain.id).where(
        Domain.tenant_id == tenant_id
    )

    total_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = total_result.scalar() or 0

    status_counts = {}
    for stat_status in ["pending", "released", "deleted", "expired"]:
        q = select(func.count()).select_from(base_query.where(Quarantine.status == stat_status).subquery())
        r = await db.execute(q)
        status_counts[stat_status] = r.scalar() or 0

    avg_result = await db.execute(select(func.avg(Quarantine.spam_score)).select_from(base_query.subquery()))
    avg_score = avg_result.scalar() or 0.0

    return {
        "total": total,
        "pending": status_counts.get("pending", 0),
        "released": status_counts.get("released", 0),
        "deleted": status_counts.get("deleted", 0),
        "expired": status_counts.get("expired", 0),
        "avg_spam_score": round(float(avg_score), 2),
    }
