from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from cmp.database import get_db
from cmp.schemas.auth import LoginRequest, TokenPair, RegisterRequest, PasswordChange
from cmp.schemas.tenant import TenantRead
from cmp.services.auth_service import register_tenant, authenticate_tenant, create_token_pair, refresh_access_token
from cmp.middleware.auth import get_current_user
from cmp.middleware.audit import log_audit
from cmp.utils.crypto import verify_password, hash_password
from cmp.models.tenant import Tenant

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post("/register", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    tenant = await register_tenant(db, req)
    await log_audit(db, tenant.id, tenant.email, "register", "tenant", tenant.id, ip_address=request.client.host if request.client else None)
    return TenantRead.model_validate(tenant, from_attributes=True).model_dump(by_alias=True)


@router.post("/login")
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    tenant = await authenticate_tenant(db, req.email, req.password)
    await log_audit(db, tenant.id, tenant.email, "login", "tenant", tenant.id, ip_address=request.client.host if request.client else None)
    tokens = create_token_pair(tenant)
    tenant_data = TenantRead.model_validate(tenant)
    return {
        "accessToken": tokens.accessToken,
        "refreshToken": tokens.refreshToken,
        "tokenType": tokens.token_type,
        "user": tenant_data.model_dump(by_alias=True)
    }


@router.post("/refresh")
async def refresh(body: dict, db: AsyncSession = Depends(get_db)):
    refresh_token = body.get("refreshToken") or body.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="refreshToken is required")
    return await refresh_access_token(db, refresh_token)


@router.put("/password")
async def change_password(
    req: PasswordChange,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(req.old_password, tenant.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Old password is incorrect")
    tenant.password_hash = hash_password(req.new_password)
    tenant.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await log_audit(db, tenant.id, tenant.email, "password_change", "tenant", tenant.id, ip_address=request.client.host if request.client else None)
    return {"message": "Password changed successfully"}


@router.get("/me", response_model=TenantRead)
async def get_me(tenant: Tenant = Depends(get_current_user)):
    return TenantRead.model_validate(tenant, from_attributes=True).model_dump(by_alias=True)
