import csv
import io
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from cmp.models.domain import Domain
from cmp.models.quarantine import Quarantine
from cmp.models.filter_rule import FilterRule
from cmp.utils.dns import check_mx_record, check_spf_record, check_dkim_record, check_dmarc_record


async def get_traffic_report(
    db: AsyncSession, tenant_id: str, start_date: datetime, end_date: datetime, domain_id: str | None = None
) -> dict:
    base = select(Domain).where(Domain.tenant_id == tenant_id, Domain.is_active == True)
    if domain_id:
        base = base.where(Domain.id == domain_id)

    result = await db.execute(base)
    domains = list(result.scalars().all())

    total_incoming = sum(d.email_count for d in domains)
    total_spam = sum(d.spam_blocked for d in domains)

    by_domain = [
        {
            "domain": d.domain_name,
            "incoming": d.email_count,
            "outgoing": 0,
            "spam": d.spam_blocked,
            "virus": 0,
        }
        for d in domains
    ]

    by_hour = [{"hour": h, "count": 0} for h in range(24)]

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "total_incoming": total_incoming,
        "total_outgoing": 0,
        "total_spam": total_spam,
        "total_virus": 0,
        "by_domain": by_domain,
        "by_hour": by_hour,
    }


async def get_spam_report(db: AsyncSession, tenant_id: str, period: str = "7d") -> dict:
    result = await db.execute(
        select(Domain).where(Domain.tenant_id == tenant_id, Domain.is_active == True)
    )
    domains = list(result.scalars().all())
    domain_ids = [d.id for d in domains]

    if not domain_ids:
        return {
            "total_spam": 0,
            "spam_ratio": 0.0,
            "top_spam_senders": [],
            "by_reason": [],
        }

    total_spam_result = await db.execute(
        select(func.count()).where(Quarantine.domain_id.in_(domain_ids))
    )
    total_spam = total_spam_result.scalar() or 0

    total_emails = sum(d.email_count for d in domains)
    spam_ratio = total_spam / max(total_emails, 1)

    # Top spam senders
    top_senders_result = await db.execute(
        select(Quarantine.sender, func.count().label("count"))
        .where(Quarantine.domain_id.in_(domain_ids))
        .group_by(Quarantine.sender)
        .order_by(func.count().desc())
        .limit(10)
    )
    top_spam_senders = [{"sender": row[0], "count": row[1]} for row in top_senders_result.all()]

    # By reason
    by_reason_result = await db.execute(
        select(Quarantine.reason, func.count().label("count"))
        .where(Quarantine.domain_id.in_(domain_ids))
        .group_by(Quarantine.reason)
        .order_by(func.count().desc())
    )
    by_reason = [{"reason": row[0], "count": row[1]} for row in by_reason_result.all()]

    return {
        "total_spam": total_spam,
        "spam_ratio": round(spam_ratio, 4),
        "top_spam_senders": top_spam_senders,
        "by_reason": by_reason,
    }


async def get_top_senders(db: AsyncSession, tenant_id: str, limit: int = 10) -> list[dict]:
    result = await db.execute(
        select(Domain.id).where(Domain.tenant_id == tenant_id, Domain.is_active == True)
    )
    domain_ids = [row[0] for row in result.all()]
    if not domain_ids:
        return []

    senders_result = await db.execute(
        select(Quarantine.sender, func.count().label("count"))
        .where(Quarantine.domain_id.in_(domain_ids))
        .group_by(Quarantine.sender)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [{"sender": row[0], "count": row[1]} for row in senders_result.all()]


async def get_domain_health_report(db: AsyncSession, tenant_id: str) -> list[dict]:
    result = await db.execute(
        select(Domain).where(Domain.tenant_id == tenant_id, Domain.is_active == True)
    )
    domains = list(result.scalars().all())
    health = []

    for domain in domains:
        mx = await check_mx_record(domain.domain_name)
        spf = await check_spf_record(domain.domain_name)
        dkim = await check_dkim_record(domain.domain_name, domain.dkim_selector)
        dmarc = await check_dmarc_record(domain.domain_name)
        score = sum([mx["ok"], spf["ok"], dkim["ok"], dmarc["ok"]]) / 4.0 * 100

        health.append({
            "domain": domain.domain_name,
            "mx_status": "ok" if mx["ok"] else "fail",
            "spf_status": "ok" if spf["ok"] else "fail",
            "dkim_status": "ok" if dkim["ok"] else "fail",
            "dmarc_status": "ok" if dmarc["ok"] else "fail",
            "score": score,
        })

    return health


def export_report(data: dict, format: str = "csv") -> bytes:
    if format == "csv":
        output = io.StringIO()
        if isinstance(data, list) and len(data) > 0:
            writer = csv.DictWriter(output, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)
        elif isinstance(data, dict):
            writer = csv.writer(output)
            for key, value in data.items():
                if isinstance(value, (list, dict)):
                    writer.writerow([key, str(value)])
                else:
                    writer.writerow([key, value])
        return output.getvalue().encode("utf-8")
    else:
        # Default CSV for unsupported formats
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Report Export"])
        for key, value in data.items():
            writer.writerow([key, str(value)])
        return output.getvalue().encode("utf-8")
