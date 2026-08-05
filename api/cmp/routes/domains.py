from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cmp.database import get_db
from cmp.models.tenant import Tenant
from cmp.models.domain import Domain
from cmp.schemas.domain import DomainCreate, DomainRead, DomainDetail, DNSCheckResult
from cmp.middleware.auth import get_current_user
from cmp.middleware.audit import log_audit
from cmp.services.domain_service import add_domain, verify_domain, remove_domain, list_domains, get_domain_health, update_dns_records

router = APIRouter(prefix="/api/v1/domains", tags=["Domains"])


@router.post("/", response_model=DomainRead, status_code=status.HTTP_201_CREATED)
async def create_domain(
    req: DomainCreate,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    domain = await add_domain(db, tenant, req.domain_name)
    await log_audit(db, tenant.id, tenant.email, "create", "domain", domain.id, details={"domain": req.domain_name}, ip_address=request.client.host if request.client else None)
    return domain


@router.get("/", response_model=list[DomainRead])
async def list_all_domains(
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_domains(db, tenant.id)


@router.get("/{domain_id}", response_model=DomainDetail)
async def get_domain(
    domain_id: str,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Domain).where(Domain.id == domain_id, Domain.tenant_id == tenant.id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    health = await get_domain_health(db, domain_id)
    return DomainDetail(**domain.__dict__, dns_status=health)


@router.delete("/{domain_id}")
async def delete_domain(
    domain_id: str,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Domain).where(Domain.id == domain_id, Domain.tenant_id == tenant.id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    await remove_domain(db, domain_id)
    await log_audit(db, tenant.id, tenant.email, "delete", "domain", domain_id, ip_address=request.client.host if request.client else None)
    return {"message": "Domain removed"}


@router.post("/{domain_id}/verify", response_model=DomainRead)
async def verify(
    domain_id: str,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Domain).where(Domain.id == domain_id, Domain.tenant_id == tenant.id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    verified = await verify_domain(db, domain_id)
    await log_audit(db, tenant.id, tenant.email, "verify", "domain", domain_id, ip_address=request.client.host if request.client else None)
    return verified


@router.get("/{domain_id}/dns-check", response_model=DNSCheckResult)
async def dns_check(
    domain_id: str,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Domain).where(Domain.id == domain_id, Domain.tenant_id == tenant.id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    health = await get_domain_health(db, domain_id)
    return DNSCheckResult(
        mx_ok=health["mx_status"] == "ok",
        spf_ok=health["spf_status"] == "ok",
        dkim_ok=health["dkim_status"] == "ok",
        dmarc_ok=health["dmarc_status"] == "ok",
        details={k: v for k, v in health.items() if k.endswith("_details")},
    )
