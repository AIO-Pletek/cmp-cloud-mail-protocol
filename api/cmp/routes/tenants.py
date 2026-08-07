from datetime import datetime, timezone
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cmp.database import get_db
from cmp.models.tenant import Tenant
from cmp.schemas.tenant import TenantRead, TenantUpdate, TenantBranding
from cmp.middleware.auth import get_current_user, require_admin
from cmp.middleware.audit import log_audit

router = APIRouter(prefix="/api/v1/tenants", tags=["Tenants"])


@router.get("", response_model=list[TenantRead])
async def list_tenants(
    admin: Tenant = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.is_active == True))
    return list(result.scalars().all())


@router.get("/{tenant_id}", response_model=TenantRead)
async def get_tenant(
    tenant_id: str,
    current: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current.id != tenant_id and current.plan != "enterprise":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


@router.put("/{tenant_id}", response_model=TenantRead)
async def update_tenant(
    tenant_id: str,
    req: TenantUpdate,
    request: Request,
    current: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current.id != tenant_id and current.plan != "enterprise":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tenant, field, value)
    tenant.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await log_audit(db, current.id, current.email, "update", "tenant", tenant_id, details=update_data, ip_address=request.client.host if request.client else None)
    await db.refresh(tenant)
    return tenant


@router.delete("/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    request: Request,
    current: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current.id != tenant_id and current.plan != "enterprise":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    tenant.is_active = False
    tenant.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await log_audit(db, current.id, current.email, "delete", "tenant", tenant_id, ip_address=request.client.host if request.client else None)
    return {"message": "Tenant deactivated"}


@router.put("/{tenant_id}/branding", response_model=TenantRead)
async def update_branding(
    tenant_id: str,
    req: TenantBranding,
    request: Request,
    current: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current.id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tenant, field, value)
    tenant.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await log_audit(db, current.id, current.email, "update_branding", "tenant", tenant_id, details=update_data, ip_address=request.client.host if request.client else None)
    await db.refresh(tenant)
    return tenant


class CreateTenantRequest(BaseModel):
    name: str
    email: str
    password: str
    plan: str = "starter"


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tenant(
    req: CreateTenantRequest,
    admin: Tenant = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from cmp.services.auth_service import hash_password
    import uuid
    existing = await db.execute(select(Tenant).where(Tenant.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    tenant = Tenant(
        id=str(uuid.uuid4()),
        name=req.name,
        slug=req.email.split("@")[0],
        email=req.email,
        password_hash=hash_password(req.password),
        plan=req.plan,
        api_key=f"cmp_{uuid.uuid4().hex[:24]}",
    )
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)
    return tenant


@router.post("/{tenant_id}/impersonate")
async def impersonate_tenant(
    tenant_id: str,
    admin: Tenant = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    from cmp.services.auth_service import create_access_token, create_refresh_token
    access_token = create_access_token(data={"sub": tenant.id})
    refresh_token = create_refresh_token(data={"sub": tenant.id})
    return {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "user": {
            "id": tenant.id,
            "name": tenant.name,
            "email": tenant.email,
            "plan": tenant.plan,
            "isAdmin": tenant.is_admin,
        },
        "impersonatedBy": admin.email,
    }
