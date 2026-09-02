import csv
import io
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
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
    domain_names = [d.domain_name for d in domains]

    total_incoming = 0
    total_outgoing = 0
    total_spam = 0
    by_domain = []
    by_hour = [{"hour": h, "count": 0} for h in range(24)]

    for dn in domain_names:
        inc_r = await db.execute(
            text("SELECT COUNT(*) FROM email_logs WHERE domain = :d AND direction = 'incoming' AND timestamp >= :s AND timestamp <= :e"),
            {"d": dn, "s": start_date, "e": end_date}
        )
        incoming = inc_r.scalar() or 0

        out_r = await db.execute(
            text("SELECT COUNT(*) FROM email_logs WHERE domain = :d AND direction = 'outgoing' AND timestamp >= :s AND timestamp <= :e"),
            {"d": dn, "s": start_date, "e": end_date}
        )
        outgoing = out_r.scalar() or 0

        spam_r = await db.execute(
            text("SELECT COUNT(*) FROM email_logs WHERE domain = :d AND status IN ('bounced', 'rejected') AND timestamp >= :s AND timestamp <= :e"),
            {"d": dn, "s": start_date, "e": end_date}
        )
        spam = spam_r.scalar() or 0

        total_incoming += incoming
        total_outgoing += outgoing
        total_spam += spam
        by_domain.append({"domain": dn, "incoming": incoming, "outgoing": outgoing, "spam": spam, "virus": 0})

    hourly_r = await db.execute(
        text("SELECT EXTRACT(HOUR FROM timestamp) as h, COUNT(*) as c FROM email_logs WHERE timestamp >= :s AND timestamp <= :e GROUP BY h ORDER BY h"),
        {"s": start_date, "e": end_date}
    )
    for row in hourly_r:
        h = int(row[0])
        if 0 <= h < 24:
            by_hour[h]["count"] = row[1]

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "total_incoming": total_incoming,
        "total_outgoing": total_outgoing,
        "total_spam": total_spam,
        "total_virus": 0,
        "by_domain": by_domain,
        "by_hour": by_hour,
    }


async def get_spam_report(db: AsyncSession, tenant_id: str, period: str = "7d") -> dict:
    result = await db.execute(select(Domain).where(Domain.tenant_id == tenant_id, Domain.is_active == True))
    domains = list(result.scalars().all())
    domain_names = [d.domain_name for d in domains]
    if not domain_names:
        return {"total_spam": 0, "spam_ratio": 0.0, "top_spam_senders": [], "by_reason": []}

    days = int(period.replace("d", ""))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    placeholders = ", ".join(["'" + d + "'" for d in domain_names])

    spam_r = await db.execute(
        text(f"SELECT COUNT(*) FROM email_logs WHERE domain IN ({placeholders}) AND status IN ('bounced', 'rejected') AND timestamp >= :s"),
        {"s": since}
    )
    total_spam = spam_r.scalar() or 0

    total_r = await db.execute(
        text(f"SELECT COUNT(*) FROM email_logs WHERE domain IN ({placeholders}) AND timestamp >= :s"),
        {"s": since}
    )
    total_emails = total_r.scalar() or 1

    return {
        "total_spam": total_spam,
        "spam_ratio": round(total_spam / total_emails, 4),
        "top_spam_senders": [],
        "by_reason": [],
    }


async def get_top_senders(db: AsyncSession, tenant_id: str, limit: int = 10) -> list:
    result = await db.execute(select(Domain).where(Domain.tenant_id == tenant_id, Domain.is_active == True))
    domains = list(result.scalars().all())
    domain_names = [d.domain_name for d in domains]
    if not domain_names:
        return []
    placeholders = ", ".join(["'" + d + "'" for d in domain_names])
    sender_r = await db.execute(
        text(f"SELECT sender, COUNT(*) as cnt FROM email_logs WHERE domain IN ({placeholders}) AND sender != '' GROUP BY sender ORDER BY cnt DESC LIMIT :lim"),
        {"lim": limit}
    )
    return [{"sender": row[0], "count": row[1]} for row in sender_r]


async def get_domain_health_report(db: AsyncSession, tenant_id: str) -> list:
    result = await db.execute(select(Domain).where(Domain.tenant_id == tenant_id, Domain.is_active == True))
    domains = list(result.scalars().all())
    health = []
    for d in domains:
        mx = await check_mx_record(d.domain_name)
        spf = await check_spf_record(d.domain_name)
        dkim = await check_dkim_record(d.domain_name, d.dkim_selector)
        dmarc = await check_dmarc_record(d.domain_name)
        health.append({
            "domain": d.domain_name,
            "mx_status": "ok" if mx else "missing",
            "spf_status": "ok" if spf else "missing",
            "dkim_status": "ok" if dkim else "missing",
            "dmarc_status": "ok" if dmarc else "missing",
        })
    return health


async def get_export_report(db: AsyncSession, tenant_id: str, start_date: datetime, end_date: datetime, domain_id: str | None = None) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Domain", "Incoming", "Outgoing", "Spam", "Virus"])
    report = await get_traffic_report(db, tenant_id, start_date, end_date, domain_id)
    for d in report["by_domain"]:
        writer.writerow([d["domain"], d["incoming"], d["outgoing"], d["spam"], d["virus"]])
    output.seek(0)
    return output.getvalue()
