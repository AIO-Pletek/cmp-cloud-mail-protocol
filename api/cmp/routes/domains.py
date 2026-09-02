from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cmp.database import get_db
from cmp.models.tenant import Tenant
from cmp.models.domain import Domain
from cmp.schemas.domain import DomainCreate, DomainRead, DomainDetail, DNSCheckResult
from cmp.middleware.auth import get_current_user
from cmp.middleware.audit import log_audit
from cmp.services.domain_service import add_domain, verify_domain, remove_domain, list_domains, get_domain_health
from cmp.services.setup_service import get_setup_check
from cmp.schemas.setup import SetupCheckResult

router = APIRouter(prefix="/api/v1/domains", tags=["Domains"])


@router.post("", response_model=DomainRead, status_code=status.HTTP_201_CREATED)
async def create_domain(req: DomainCreate, request: Request, tenant: Tenant = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    domain = await add_domain(db, tenant, req.domain_name)
    return domain


@router.get("", response_model=list[DomainRead])
async def list_all_domains(tenant: Tenant = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await list_domains(db, tenant.id, is_admin=tenant.is_admin)


@router.get("/{domain_id}", response_model=DomainDetail)
async def get_domain(domain_id: str, tenant: Tenant = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    health = await get_domain_health(db, domain_id)
    return DomainDetail(**domain.__dict__, dns_status=health)


@router.delete("/{domain_id}")
async def delete_domain(domain_id: str, tenant: Tenant = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    await remove_domain(db, domain_id)
    return {"message": "Domain deleted"}


@router.post("/{domain_id}/verify", response_model=DomainRead)
async def verify(domain_id: str, tenant: Tenant = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await verify_domain(db, domain_id)


@router.get("/{domain_id}/dns-check", response_model=DNSCheckResult)
async def dns_check(domain_id: str, tenant: Tenant = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await get_domain_health(db, domain_id)


@router.get("/{domain_id}/setup-check", response_model=SetupCheckResult)
async def setup_check(domain_id: str, tenant: Tenant = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await get_setup_check(db, domain_id)
