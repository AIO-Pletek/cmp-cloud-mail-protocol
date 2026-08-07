"""Email alerting service - send notifications to clients."""
import json
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

ALERTS_FILE = "/etc/cmp/email_alerts.json"
SMTP_HOST = "127.0.0.1"
SMTP_PORT = 25
FROM_ADDR = "alerts@mailprotocol.cbncloud.net"


def load_alerts():
    try:
        with open(ALERTS_FILE) as f:
            return json.load(f)
    except Exception:
        return {"alerts": []}


def save_alerts(data):
    os.makedirs(os.path.dirname(ALERTS_FILE), exist_ok=True)
    with open(ALERTS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def create_alert(email, events, domain=None, label=None):
    data = load_alerts()
    alert = {
        "id": os.urandom(8).hex(),
        "email": email,
        "events": events,
        "domain": domain,
        "label": label or email,
        "enabled": True,
        "created_at": datetime.now().isoformat(),
    }
    data["alerts"].append(alert)
    save_alerts(data)
    return alert


def delete_alert(alert_id):
    data = load_alerts()
    data["alerts"] = [a for a in data["alerts"] if a["id"] != alert_id]
    save_alerts(data)


def toggle_alert(alert_id, enabled):
    data = load_alerts()
    for a in data["alerts"]:
        if a["id"] == alert_id:
            a["enabled"] = enabled
    save_alerts(data)


def list_alerts():
    return load_alerts().get("alerts", [])


VALID_EVENTS = [
    "email.bounced",
    "email.rejected",
    "email.deferred",
    "spam.detected",
    "virus.detected",
    "quota.warning",
    "queue.full",
    "daily.summary",
]


EVENT_LABELS = {
    "email.bounced": "Email Bounced",
    "email.rejected": "Email Rejected",
    "email.deferred": "Email Deferred",
    "spam.detected": "Spam Detected",
    "virus.detected": "Virus Detected",
    "quota.warning": "Quota Warning",
    "queue.full": "Queue Full",
    "daily.summary": "Daily Summary",
}

EVENT_COLORS = {
    "email.bounced": "#f59e0b",
    "email.rejected": "#ef4444",
    "email.deferred": "#f97316",
    "spam.detected": "#dc2626",
    "virus.detected": "#7c3aed",
    "quota.warning": "#8b5cf6",
    "queue.full": "#ef4444",
    "daily.summary": "#3b82f6",
}


def build_email_html(event, data):
    color = EVENT_COLORS.get(event, "#6b7280")
    label = EVENT_LABELS.get(event, event)
    sender = data.get("sender", "-")
    recipient = data.get("recipient", "-")
    domain = data.get("domain", "-")
    status = data.get("status", "-")
    score = data.get("score", "-")
    reason = data.get("reason", "")
    timestamp = data.get("timestamp", datetime.now().isoformat())

    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: {color}; color: white; padding: 16px 24px;">
          <h2 style="margin: 0; font-size: 18px;">CMP Alert: {label}</h2>
        </div>
        <div style="padding: 24px;">
          <p style="color: #6b7280; font-size: 14px; margin-top: 0;">{timestamp}</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px;">Sender</td><td style="padding: 8px 0; font-size: 14px;">{sender}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Recipient</td><td style="padding: 8px 0; font-size: 14px;">{recipient}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Domain</td><td style="padding: 8px 0; font-size: 14px;">{domain}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status</td><td style="padding: 8px 0; font-size: 14px;"><strong>{status}</strong></td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Score</td><td style="padding: 8px 0; font-size: 14px;">{score}</td></tr>
            {'<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Reason</td><td style="padding: 8px 0; font-size: 14px; color: #ef4444;">' + reason + '</td></tr>' if reason else ''}
          </table>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">This is an automated alert from CMP Cloud Mail Protocol.</p>
        </div>
      </div>
    </body>
    </html>
    """
    return html


def send_alert_email(to_email, event, data):
    label = EVENT_LABELS.get(event, event)
    subject = f"[CMP Alert] {label} - {data.get('domain', 'Unknown')}"

    html = build_email_html(event, data)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"CMP Alerts <{FROM_ADDR}>"
    msg["To"] = to_email

    plain = f"CMP Alert: {label}\n\nSender: {data.get('sender', '-')}\nRecipient: {data.get('recipient', '-')}\nDomain: {data.get('domain', '-')}\nStatus: {data.get('status', '-')}\n"
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.sendmail(FROM_ADDR, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"Alert email failed: {e}")
        return False


def dispatch_alert(event, data):
    """Send alert emails for matching events."""
    alerts = load_alerts().get("alerts", [])
    results = []
    for alert in alerts:
        if not alert.get("enabled"):
            continue
        if event not in alert.get("events", []):
            continue
        domain_filter = alert.get("domain")
        if domain_filter and data.get("domain") != domain_filter:
            continue
        ok = send_alert_email(alert["email"], event, data)
        results.append({"email": alert["email"], "sent": ok})
    return results
