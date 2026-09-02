from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from cmp.database import get_db
from cmp.models.tenant import Tenant
from cmp.schemas.quarantine import QuarantineRead, QuarantineDetail, QuarantineStats
from cmp.middleware.auth import get_current_user
from cmp.middleware.audit import log_audit
from cmp.services import quarantine_service

router = APIRouter(prefix="/api/v1/quarantine", tags=["Quarantine"])


@router.get("")
async def list_quarantine(
    domain_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await quarantine_service.list_quarantined(
        db, tenant.id, domain_id, status_filter, search, page, per_page
    )
    result["items"] = [QuarantineRead.model_validate(item) for item in result["items"]]
    return result


@router.get("/stats", response_model=QuarantineStats)
async def get_stats(
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await quarantine_service.get_stats(db, tenant.id)


@router.get("/{quarantine_id}", response_model=QuarantineDetail)
async def get_detail(
    quarantine_id: str,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await quarantine_service.get_detail(db, quarantine_id)
    return QuarantineDetail.model_validate(item)


@router.post("/{quarantine_id}/release", response_model=QuarantineRead)
async def release_item(
    quarantine_id: str,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await quarantine_service.release_quarantine(db, quarantine_id)
    await log_audit(db, tenant.id, tenant.email, "release", "quarantine", quarantine_id, ip_address=request.client.host if request.client else None)
    return QuarantineRead.model_validate(item)


@router.delete("/{quarantine_id}", response_model=QuarantineRead)
async def delete_item(
    quarantine_id: str,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await quarantine_service.delete_quarantine(db, quarantine_id)
    await log_audit(db, tenant.id, tenant.email, "delete", "quarantine", quarantine_id, ip_address=request.client.host if request.client else None)
    return QuarantineRead.model_validate(item)


@router.post("/bulk")
async def bulk_action(
    body: dict,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ids = body.get("ids", [])
    action = body.get("action", "delete")
    if not ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No IDs provided")
    result = await quarantine_service.bulk_action(db, ids, action)
    await log_audit(db, tenant.id, tenant.email, f"bulk_{action}", "quarantine", None, details={"ids": ids, **result}, ip_address=request.client.host if request.client else None)
    return result
