"""Scheduled report generation service for CMP mail gateway."""
import json
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
import asyncio
import asyncpg
import dns.resolver


DB_URL = "postgresql://cmp:{password}@127.0.0.1:5432/cmp"
CONFIG_PATH = "/etc/cmp/scheduled_reports.json"


def get_db_password():
    with open("/opt/cmp/.env") as f:
        for line in f:
            key, _, value = line.partition("=")
            if key.strip() == "DB_PASSWORD":
                return value.strip()
    return os.environ.get("DB_PASSWORD", "")


async def get_db():
    password = get_db_password()
    return await asyncpg.connect(DB_URL.format(password=password))


def load_config() -> list:
    if not os.path.exists(CONFIG_PATH):
        return []
    with open(CONFIG_PATH) as f:
        return json.load(f)


def save_config(reports: list):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(reports, f, indent=2, default=str)


async def get_domain_stats(conn, domain_name: str, since: datetime) -> dict:
    """Get email stats for a domain since a given time."""
    total = await conn.fetchval(
        "SELECT COUNT(*) FROM email_logs WHERE domain = $1 AND timestamp >= $2",
        domain_name, since
    ) or 0
    delivered = await conn.fetchval(
        "SELECT COUNT(*) FROM email_logs WHERE domain = $1 AND timestamp >= $2 AND status = 'sent'",
        domain_name, since
    ) or 0
    bounced = await conn.fetchval(
        "SELECT COUNT(*) FROM email_logs WHERE domain = $1 AND timestamp >= $2 AND status = 'bounced'",
        domain_name, since
    ) or 0
    rejected = await conn.fetchval(
        "SELECT COUNT(*) FROM email_logs WHERE domain = $1 AND timestamp >= $2 AND status = 'rejected'",
        domain_name, since
    ) or 0
    spam = await conn.fetchval(
        "SELECT COUNT(*) FROM email_logs WHERE domain = $1 AND timestamp >= $2 AND status IN ('spam', 'rejected', 'bounced') AND action = 'reject'",
        domain_name, since
    ) or 0

    top_senders = await conn.fetch(
        "SELECT sender, COUNT(*) as cnt FROM email_logs WHERE domain = $1 AND timestamp >= $2 AND sender != '' GROUP BY sender ORDER BY cnt DESC LIMIT 5",
        domain_name, since
    )
    top_recipients = await conn.fetch(
        "SELECT recipient, COUNT(*) as cnt FROM email_logs WHERE domain = $1 AND timestamp >= $2 AND recipient != '' GROUP BY recipient ORDER BY cnt DESC LIMIT 5",
        domain_name, since
    )

    return {
        "total": total,
        "delivered": delivered,
        "bounced": bounced,
        "rejected": rejected,
        "spam_blocked": spam,
        "top_senders": [{"address": r["sender"], "count": r["cnt"]} for r in top_senders],
        "top_recipients": [{"address": r["recipient"], "count": r["cnt"]} for r in top_recipients],
    }


async def check_domain_health(domain_name: str) -> dict:
    """Check MX, SPF, DKIM, DMARC for a domain."""
    loop = asyncio.get_event_loop()
    health = {"mx": "missing", "spf": "missing", "dkim": "missing", "dmarc": "missing"}

    # MX
    try:
        answers = await loop.run_in_executor(None, lambda: dns.resolver.resolve(domain_name, "MX"))
        if answers:
            health["mx"] = "ok"
    except Exception:
        pass

    # SPF
    try:
        answers = await loop.run_in_executor(None, lambda: dns.resolver.resolve(domain_name, "TXT"))
        for r in answers:
            if "v=spf1" in str(r):
                health["spf"] = "ok"
                break
    except Exception:
        pass

    # DKIM (default selector "cmp")
    try:
        dkim_domain = f"cmp._domainkey.{domain_name}"
        answers = await loop.run_in_executor(None, lambda: dns.resolver.resolve(dkim_domain, "TXT"))
        if answers:
            health["dkim"] = "ok"
    except Exception:
        pass

    # DMARC
    try:
        dmarc_domain = f"_dmarc.{domain_name}"
        answers = await loop.run_in_executor(None, lambda: dns.resolver.resolve(dmarc_domain, "TXT"))
        for r in answers:
            if "v=DMARC1" in str(r):
                health["dmarc"] = "ok"
                break
    except Exception:
        pass

    return health


def render_report_html(domain_name: str, stats: dict, health: dict, period_start: str, period_end: str) -> str:
    """Render HTML email report with CMP branding."""
    def status_badge(val):
        if val == "ok":
            return '<span style="color:#10b981;font-weight:bold">✓ OK</span>'
        return '<span style="color:#ef4444;font-weight:bold">✗ Missing</span>'

    sender_rows = ""
    for i, s in enumerate(stats["top_senders"], 1):
        sender_rows += f"<tr><td>{i}</td><td>{s['address']}</td><td style='text-align:right'>{s['count']}</td></tr>"
    if not stats["top_senders"]:
        sender_rows = "<tr><td colspan='3' style='text-align:center;color:#888'>No data</td></tr>"

    recipient_rows = ""
    for i, r in enumerate(stats["top_recipients"], 1):
        recipient_rows += f"<tr><td>{i}</td><td>{r['address']}</td><td style='text-align:right'>{r['count']}</td></tr>"
    if not stats["top_recipients"]:
        recipient_rows = "<tr><td colspan='3' style='text-align:center;color:#888'>No data</td></tr>"

    spam_rate = round((stats["spam_blocked"] / max(stats["total"], 1)) * 100, 1)
    delivery_rate = round((stats["delivered"] / max(stats["total"], 1)) * 100, 1)

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; margin: 0; padding: 20px;">
<div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e3a5f, #2563eb); padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">CMP Mail Gateway</h1>
        <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 14px;">Weekly Report — {domain_name}</p>
    </div>

    <!-- Period -->
    <div style="padding: 16px 32px; background: #f8fafc; border-bottom: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #64748b; font-size: 13px;">Report period: <strong>{period_start}</strong> to <strong>{period_end}</strong></p>
    </div>

    <!-- Stats Grid -->
    <div style="padding: 24px 32px;">
        <h2 style="font-size: 16px; color: #1e293b; margin: 0 0 16px 0;">📊 Email Statistics</h2>
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 12px; background: #f0f9ff; border-radius: 8px; text-align: center; width: 25%;">
                    <div style="font-size: 24px; font-weight: bold; color: #1e3a5f;">{stats['total']}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Total Emails</div>
                </td>
                <td style="width: 8px;"></td>
                <td style="padding: 12px; background: #f0fdf4; border-radius: 8px; text-align: center; width: 25%;">
                    <div style="font-size: 24px; font-weight: bold; color: #166534;">{stats['delivered']}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Delivered ({delivery_rate}%)</div>
                </td>
                <td style="width: 8px;"></td>
                <td style="padding: 12px; background: #fef2f2; border-radius: 8px; text-align: center; width: 25%;">
                    <div style="font-size: 24px; font-weight: bold; color: #991b1b;">{stats['bounced']}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Bounced</div>
                </td>
                <td style="width: 8px;"></td>
                <td style="padding: 12px; background: #fffbeb; border-radius: 8px; text-align: center; width: 25%;">
                    <div style="font-size: 24px; font-weight: bold; color: #92400e;">{stats['rejected']}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Rejected</div>
                </td>
            </tr>
        </table>
        <div style="margin-top: 12px; padding: 10px 16px; background: #fef9c3; border-radius: 8px; text-align: center;">
            <span style="font-size: 13px; color: #854d0e;">🚫 Spam blocked: <strong>{stats['spam_blocked']}</strong> ({spam_rate}% of total)</span>
        </div>
    </div>

    <!-- Top Senders -->
    <div style="padding: 0 32px 24px;">
        <h2 style="font-size: 16px; color: #1e293b; margin: 0 0 12px 0;">📤 Top 5 Senders</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="background: #f8fafc;"><th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">#</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Address</th><th style="padding: 8px; text-align: right; border-bottom: 2px solid #e2e8f0;">Count</th></tr>
            {sender_rows}
        </table>
    </div>

    <!-- Top Recipients -->
    <div style="padding: 0 32px 24px;">
        <h2 style="font-size: 16px; color: #1e293b; margin: 0 0 12px 0;">📥 Top 5 Recipients</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="background: #f8fafc;"><th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">#</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Address</th><th style="padding: 8px; text-align: right; border-bottom: 2px solid #e2e8f0;">Count</th></tr>
            {recipient_rows}
        </table>
    </div>

    <!-- Domain Health -->
    <div style="padding: 0 32px 24px;">
        <h2 style="font-size: 16px; color: #1e293b; margin: 0 0 12px 0;">🏥 Domain Health</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="background: #f8fafc;"><th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Check</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Status</th></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">MX Record</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">{status_badge(health['mx'])}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">SPF Record</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">{status_badge(health['spf'])}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">DKIM Record</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">{status_badge(health['dkim'])}</td></tr>
            <tr><td style="padding: 8px;">DMARC Record</td><td style="padding: 8px;">{status_badge(health['dmarc'])}</td></tr>
        </table>
    </div>

    <!-- Footer -->
    <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">Generated by CMP Mail Gateway &bull; mailprotocol.cbncloud.net</p>
    </div>
</div>
</body>
</html>"""


def send_report_email(to_email: str, subject: str, html_body: str):
    """Send report email via local Postfix on port 25."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = "CMP Reports <reports@mailprotocol.cbncloud.net>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP("127.0.0.1", 25) as smtp:
        smtp.send_message(msg)


async def generate_and_send_report(report_config: dict) -> dict:
    """Generate and send a weekly report for a configured schedule."""
    conn = await get_db()
    try:
        now = datetime.now(timezone.utc)
        since = now - timedelta(days=7)
        period_start = since.strftime("%Y-%m-%d")
        period_end = now.strftime("%Y-%m-%d")
        domains = report_config.get("domains", [])
        recipient = report_config["email"]
        results = []

        for domain_name in domains:
            stats = await get_domain_stats(conn, domain_name, since)
            health = await check_domain_health(domain_name)
            html = render_report_html(domain_name, stats, health, period_start, period_end)
            subject = f"CMP Weekly Report — {domain_name} ({period_start} to {period_end})"
            send_report_email(recipient, subject, html)
            results.append({"domain": domain_name, "sent": True})

        return {"success": True, "reports_sent": len(results), "details": results}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await conn.close()


def add_report(email: str, frequency: str, domains: list) -> dict:
    """Add a new scheduled report."""
    reports = load_config()
    new_report = {
        "id": len(reports) + 1,
        "email": email,
        "frequency": frequency,
        "domains": domains,
        "enabled": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    reports.append(new_report)
    save_config(reports)
    return new_report


def list_reports() -> list:
    """List all scheduled reports."""
    return load_config()


def delete_report(report_id: int) -> bool:
    """Delete a scheduled report by ID."""
    reports = load_config()
    original_len = len(reports)
    reports = [r for r in reports if r.get("id") != report_id]
    if len(reports) < original_len:
        save_config(reports)
        return True
    return False


def get_report_by_id(report_id: int) -> dict | None:
    """Get a single report config by ID."""
    for r in load_config():
        if r.get("id") == report_id:
            return r
    return None
