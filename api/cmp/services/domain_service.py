from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from cmp.models.domain import Domain
from cmp.models.tenant import Tenant
from cmp.utils.crypto import generate_verification_token
from cmp.utils.dns import check_mx_record, check_spf_record, check_dkim_record, check_dmarc_record
from cmp.utils.dns import generate_dkim_key_pair
from cmp.config import settings

# Known MX targets that indicate this gateway is handling mail for the domain
GATEWAY_MX_TARGETS = {"103.24.12.21", "mailprotocol.cbncloud.net"}


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
    """Verify domain by checking that an MX record points to our gateway.

    Looks up MX records for the domain. If any record resolves to
    103.24.12.21 or mailprotocol.cbncloud.net, marks the domain verified
    and stores the matching MX value.  Otherwise raises 400 with the
    current MX records so the user knows what to fix.
    """
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    mx_result = await check_mx_record(domain.domain_name)

    if not mx_result.get("ok") or not mx_result.get("records"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": f"No MX records found for {domain.domain_name}. "
                           f"Please add an MX record pointing to mailprotocol.cbncloud.net.",
                "mx_records": [],
                "expected": list(GATEWAY_MX_TARGETS),
            },
        )

    # Check whether any MX record points at our gateway (exact or suffix match)
    matched_mx = None
    for record in mx_result["records"]:
        record_lower = record.strip().lower().rstrip(".")
        for target in GATEWAY_MX_TARGETS:
            if record_lower == target.lower() or record_lower.endswith("." + target.lower()):
                matched_mx = record
                break
        if matched_mx:
            break

    if matched_mx is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": f"MX records for {domain.domain_name} do not point to this gateway. "
                           f"Please set your MX record to mailprotocol.cbncloud.net.",
                "mx_records": mx_result["records"],
                "expected": list(GATEWAY_MX_TARGETS),
            },
        )

    # MX check passed — mark verified and store the matching record
    domain.is_verified = True
    domain.mx_record = matched_mx
    domain.updated_at = datetime.now(timezone.utc)
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
