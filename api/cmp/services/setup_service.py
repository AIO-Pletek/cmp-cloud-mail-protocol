from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cmp.models.domain import Domain
from cmp.utils.dns import check_mx_record, check_spf_record, check_dkim_record, check_dmarc_record


async def get_setup_check(db: AsyncSession, domain_id: str) -> dict:
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    # Run live DNS checks
    mx_result = await check_mx_record(domain.domain_name)
    spf_result = await check_spf_record(domain.domain_name)
    dkim_result = await check_dkim_record(domain.domain_name, domain.dkim_selector or "cmp")
    dmarc_result = await check_dmarc_record(domain.domain_name)

    # Determine step completion - use live DNS check (actual records in DNS)
    mx_done = mx_result.get("ok", False)
    spf_done = spf_result.get("ok", False)
    dkim_done = dkim_result.get("ok", False)
    dmarc_done = dmarc_result.get("ok", False)

    # Step 5: test email - mark done if domain is verified (best available proxy)
    test_done = domain.is_verified if hasattr(domain, 'is_verified') else False

    steps_done = sum([mx_done, spf_done, dkim_done, dmarc_done, test_done])
    completion = int((steps_done / 5) * 100)

    # Build DKIM DNS hostname
    dkim_host = f"{domain.dkim_selector or 'cmp'}._domainkey.{domain.domain_name}"

    return {
        "domain_id": str(domain.id),
        "domain_name": domain.domain_name,
        "step1_dns": mx_done,
        "step1_record": {
            "type": "MX",
            "host": domain.domain_name,
            "value": f"10 mail.{domain.domain_name}",
        },
        "step2_spf": spf_done,
        "step2_record": {
            "type": "TXT",
            "host": domain.domain_name,
            "value": domain.spf_record or f"v=spf1 ip4:103.24.12.21 ~all",
        },
        "step3_dkim": dkim_done,
        "step3_record": {
            "type": "TXT",
            "host": dkim_host,
            "value": domain.dkim_public_key or "",
        },
        "step4_dmarc": dmarc_done,
        "step4_record": {
            "type": "TXT",
            "host": f"_dmarc.{domain.domain_name}",
            "value": domain.dmarc_record or f"v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain.domain_name}",
        },
        "step5_test": test_done,
        "completion_percentage": completion,
    }
