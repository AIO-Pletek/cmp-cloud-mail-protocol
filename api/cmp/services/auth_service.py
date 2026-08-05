import re
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, status
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cmp.config import settings
from cmp.models.tenant import Tenant
from cmp.schemas.auth import RegisterRequest, LoginRequest, TokenPair
from cmp.utils.crypto import hash_password, verify_password, generate_api_key


async def register_tenant(db: AsyncSession, req: RegisterRequest) -> Tenant:
    existing = await db.execute(select(Tenant).where(Tenant.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    slug = re.sub(r"[^a-z0-9]+", "-", req.name.lower()).strip("-")
    slug_check = await db.execute(select(Tenant).where(Tenant.slug == slug))
    if slug_check.scalar_one_or_none():
        import uuid
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    tenant = Tenant(
        name=req.name,
        slug=slug,
        email=req.email,
        password_hash=hash_password(req.password),
        api_key=generate_api_key(),
        plan=req.company if req.company else "starter",
    )
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)
    return tenant


async def authenticate_tenant(db: AsyncSession, email: str, password: str) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.email == email))
    tenant = result.scalar_one_or_none()
    if tenant is None or not verify_password(password, tenant.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return tenant


def create_token_pair(tenant: Tenant) -> TokenPair:
    now = datetime.now(timezone.utc)
    access_payload = {
        "sub": tenant.id,
        "type": "access",
        "email": tenant.email,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE),
        "iat": now,
    }
    refresh_payload = {
        "sub": tenant.id,
        "type": "refresh",
        "exp": now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE),
        "iat": now,
    }
    access_token = jwt.encode(access_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    refresh_token = jwt.encode(refresh_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return TokenPair(access_token=access_token, refresh_token=refresh_token, token_type="bearer")


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> TokenPair:
    try:
        payload = jwt.decode(refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        tenant_id = payload.get("sub")
        token_type = payload.get("type")
        if tenant_id is None or token_type != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None or not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tenant not found or inactive")
    return create_token_pair(tenant)
