import os
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cmp.models.domain import Domain
from cmp.models.tenant import Tenant
from cmp.config import settings
from cmp.utils.dns import (
    check_mx_record, check_spf_record, check_dkim_record, check_dmarc_record,
    generate_dkim_key_pair, verify_domain_ownership,
)
from cmp.utils.crypto import generate_verification_token
from cmp.services.postfix_service import add_virtual_domain, remove_virtual_domain
from cmp.services.dkim_service import generate_key, get_dns_record


async def add_domain(db: AsyncSession, tenant: Tenant, domain_name: str) -> Domain:
    existing = await db.execute(select(Domain).where(Domain.domain_name == domain_name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Domain already registered")

    verification_token = generate_verification_token()
    try:
        private_key, public_key = await generate_dkim_key_pair(
            domain_name, "cmp", settings.DKIM_KEY_DIR
        )
    except Exception:
        public_key = None

    domain = Domain(
        tenant_id=tenant.id,
        domain_name=domain_name,
        verification_token=verification_token,
        dkim_public_key=public_key,
        spf_record=f"v=spf1 include:_spf.{domain_name} ~all",
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

    verified = await verify_domain_ownership(domain.domain_name, domain.verification_token)
    if not verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Domain verification failed. Add the TXT record to your DNS.")

    domain.is_verified = True
    await db.flush()

    try:
        await add_virtual_domain(domain.domain_name)
    except Exception:
        pass

    await db.refresh(domain)
    return domain


async def remove_domain(db: AsyncSession, domain_id: str) -> None:
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    try:
        await remove_virtual_domain(domain.domain_name)
    except Exception:
        pass

    # Remove DKIM keys
    for ext in [".private", ".public"]:
        key_path = os.path.join(settings.DKIM_KEY_DIR, f"{domain.domain_name}.cmp{ext}")
        if os.path.exists(key_path):
            os.remove(key_path)

    domain.is_active = False
    await db.flush()


async def list_domains(db: AsyncSession, tenant_id: str) -> list[Domain]:
    result = await db.execute(
        select(Domain).where(Domain.tenant_id == tenant_id, Domain.is_active == True)
    )
    return list(result.scalars().all())


async def get_domain_health(db: AsyncSession, domain_id: str) -> dict:
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    mx = await check_mx_record(domain.domain_name)
    spf = await check_spf_record(domain.domain_name)
    dkim = await check_dkim_record(domain.domain_name, domain.dkim_selector)
    dmarc = await check_dmarc_record(domain.domain_name)

    score = sum([mx["ok"], spf["ok"], dkim["ok"], dmarc["ok"]]) / 4.0 * 100

    return {
        "domain": domain.domain_name,
        "mx_status": "ok" if mx["ok"] else "fail",
        "spf_status": "ok" if spf["ok"] else "fail",
        "dkim_status": "ok" if dkim["ok"] else "fail",
        "dmarc_status": "ok" if dmarc["ok"] else "fail",
        "score": score,
        "mx_details": mx,
        "spf_details": spf,
        "dkim_details": dkim,
        "dmarc_details": dmarc,
    }


async def update_dns_records(db: AsyncSession, domain_id: str) -> Domain:
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    mx = await check_mx_record(domain.domain_name)
    spf = await check_spf_record(domain.domain_name)
    dmarc = await check_dmarc_record(domain.domain_name)

    if mx["ok"]:
        domain.mx_record = ", ".join(mx["records"])
    if spf["ok"]:
        domain.spf_record = ", ".join(spf["records"])
    if dmarc["ok"]:
        domain.dmarc_record = ", ".join(dmarc["records"])

    await db.flush()
    await db.refresh(domain)
    return domain
