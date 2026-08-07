from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from cmp.database import get_db
from cmp.models.tenant import Tenant
from cmp.middleware.auth import get_current_user
from cmp.services import report_service

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])


def parse_period(period: str) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    days = int(period.replace('d', '').replace('D', ''))
    start = now - timedelta(days=days)
    return start, now


@router.get("/traffic")
async def traffic_report(
    period: str = Query("7d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    domain_id: str | None = Query(None),
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    else:
        start, end = parse_period(period)
    return await report_service.get_traffic_report(db, tenant.id, start, end, domain_id)


@router.get("/spam")
async def spam_report(
    period: str = Query("7d"),
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_spam_report(db, tenant.id, period)


@router.get("/top-senders")
async def top_senders(
    limit: int = Query(10, ge=1, le=100),
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_top_senders(db, tenant.id, limit)


@router.get("/domain-health")
async def domain_health(
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_domain_health_report(db, tenant.id)


@router.get("/export")
async def export_report(
    format: str = Query("csv"),
    period: str = Query("7d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    domain_id: str | None = Query(None),
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    else:
        start, end = parse_period(period)
    csv_data = await report_service.get_export_report(db, tenant.id, start, end, domain_id)
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cmp-report.csv"}
    )
