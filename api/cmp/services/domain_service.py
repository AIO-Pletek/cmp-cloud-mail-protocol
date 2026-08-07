from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cmp.models.domain import Domain
from cmp.models.tenant import Tenant
from cmp.utils.crypto import generate_verification_token
from cmp.utils.dns import check_mx_record, check_spf_record, check_dkim_record, check_dmarc_record
from cmp.utils.dns import generate_dkim_key_pair
from cmp.config import settings


async def list_domains(db: AsyncSession, tenant_id: str, is_admin: bool = False) -> list[Domain]:
    if is_admin:
        result = await db.execute(select(Domain).where(Domain.is_active == True))
    else:
        result = await db.execute(select(Domain).where(Domain.tenant_id == tenant_id, Domain.is_active == True))
    return list(result.scalars().all())


async def add_domain(db: AsyncSession, tenant: Tenant, domain_name: str) -> Domain:
    existing = await db.execute(select(Domain).where(Domain.domain_name == domain_name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Domain already registered")
    verification_token = generate_verification_token()
    try:
        private_key, public_key = await generate_dkim_key_pair(domain_name, "cmp", settings.DKIM_KEY_DIR)
    except Exception:
        public_key = None
    domain = Domain(
        tenant_id=tenant.id, domain_name=domain_name, verification_token=verification_token,
        dkim_public_key=public_key,
        spf_record=f"v=spf1 ip4:103.24.12.21 ~all",
        dmarc_record=f"v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain_name}",
    )
    db.add(domain)
    await db.flush()
    await db.refresh(domain)
    return domain


async def verify_domain(db: AsyncSession, domain_id: str) -> Domain:
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    domain.is_verified = True
    await db.flush()
    await db.refresh(domain)
    return domain


async def remove_domain(db: AsyncSession, domain_id: str) -> None:
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    await db.delete(domain)


async def get_domain_health(db: AsyncSession, domain_id: str) -> dict:
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    mx = await check_mx_record(domain.domain_name)
    spf = await check_spf_record(domain.domain_name)
    dkim = await check_dkim_record(domain.domain_name, domain.dkim_selector)
    dmarc = await check_dmarc_record(domain.domain_name)
    return {"mx_ok": mx, "spf_ok": spf, "dkim_ok": dkim, "dmarc_ok": dmarc, "details": {}}


async def update_dns_records(db: AsyncSession, domain_id: str) -> Domain:
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    return domain
