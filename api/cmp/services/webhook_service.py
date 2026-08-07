"""Webhook notification service for CMP mail gateway events.

Manages webhook registrations (CRUD) stored in /etc/cmp/webhooks.json
and dispatches event notifications via async HTTP POST with HMAC-SHA256 signatures.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger("cmp.webhook_service")

WEBHOOKS_FILE = "/etc/cmp/webhooks.json"

VALID_EVENTS = [
    "email.sent",
    "email.bounced",
    "email.rejected",
    "email.deferred",
    "spam.detected",
    "virus.detected",
]

# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

def _load_webhooks() -> dict:
    """Load webhooks dict keyed by webhook id."""
    if not os.path.exists(WEBHOOKS_FILE):
        return {}
    try:
        with open(WEBHOOKS_FILE, "r") as f:
            data = json.load(f)
            if isinstance(data, list):
                # migrate legacy list format to dict
                return {w["id"]: w for w in data}
            return data
    except (json.JSONDecodeError, KeyError):
        return {}


def _save_webhooks(webhooks: dict) -> None:
    os.makedirs(os.path.dirname(WEBHOOKS_FILE), exist_ok=True)
    tmp = WEBHOOKS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(webhooks, f, indent=2, default=str)
    os.replace(tmp, WEBHOOKS_FILE)


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------

def list_webhooks(tenant_id: Optional[str] = None) -> list[dict]:
    webhooks = _load_webhooks()
    result = list(webhooks.values())
    if tenant_id:
        result = [w for w in result if w.get("tenant_id") == tenant_id]
    return result


def get_webhook(webhook_id: str) -> Optional[dict]:
    return _load_webhooks().get(webhook_id)


def create_webhook(
    tenant_id: str,
    url: str,
    events: list[str],
    secret: Optional[str] = None,
    enabled: bool = True,
) -> dict:
    # Validate events
    invalid = [e for e in events if e not in VALID_EVENTS]
    if invalid:
        raise ValueError(f"Invalid events: {invalid}. Valid: {VALID_EVENTS}")

    webhook_id = str(uuid.uuid4())
    if not secret:
        secret = uuid.uuid4().hex

    webhook = {
        "id": webhook_id,
        "tenant_id": tenant_id,
        "url": url,
        "events": events,
        "secret": secret,
        "enabled": enabled,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    webhooks = _load_webhooks()
    webhooks[webhook_id] = webhook
    _save_webhooks(webhooks)
    logger.info("Created webhook %s for tenant %s -> %s", webhook_id, tenant_id, url)
    return webhook


def update_webhook(webhook_id: str, **fields) -> Optional[dict]:
    webhooks = _load_webhooks()
    webhook = webhooks.get(webhook_id)
    if not webhook:
        return None

    if "events" in fields:
        invalid = [e for e in fields["events"] if e not in VALID_EVENTS]
        if invalid:
            raise ValueError(f"Invalid events: {invalid}. Valid: {VALID_EVENTS}")

    allowed = {"url", "events", "secret", "enabled"}
    for key, value in fields.items():
        if key in allowed:
            webhook[key] = value

    webhook["updated_at"] = datetime.now(timezone.utc).isoformat()
    webhooks[webhook_id] = webhook
    _save_webhooks(webhooks)
    logger.info("Updated webhook %s", webhook_id)
    return webhook


def delete_webhook(webhook_id: str) -> bool:
    webhooks = _load_webhooks()
    if webhook_id not in webhooks:
        return False
    del webhooks[webhook_id]
    _save_webhooks(webhooks)
    logger.info("Deleted webhook %s", webhook_id)
    return True


# ---------------------------------------------------------------------------
# Signature generation
# ---------------------------------------------------------------------------

def generate_signature(payload: bytes, secret: str) -> str:
    """Generate HMAC-SHA256 hex digest for a JSON payload."""
    return hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()


# ---------------------------------------------------------------------------
# Event dispatch
# ---------------------------------------------------------------------------

async def dispatch_event(event: str, data: dict) -> list[dict]:
    """Send webhook notifications for an event to all matching, enabled webhooks.

    Args:
        event: Event name (e.g. "email.sent").
        data: Event-specific payload (sender, recipient, domain, status, score, ...).

    Returns:
        List of delivery results: {webhook_id, url, status_code, success, error}.
    """
    if event not in VALID_EVENTS:
        logger.warning("Unknown event type: %s", event)
        return []

    webhooks = _load_webhooks()
    targets = [
        w for w in webhooks.values()
        if w.get("enabled") and event in w.get("events", [])
    ]

    if not targets:
        logger.debug("No webhooks registered for event %s", event)
        return []

    payload_base = {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }
    payload_bytes = json.dumps(payload_base, default=str).encode("utf-8")

    results = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = [
            _deliver(client, wh, payload_bytes, payload_base)
            for wh in targets
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    return [r for r in results if isinstance(r, dict)]


async def _deliver(
    client: httpx.AsyncClient,
    webhook: dict,
    payload_bytes: bytes,
    payload_dict: dict,
) -> dict:
    """POST payload to a single webhook endpoint."""
    webhook_id = webhook["id"]
    url = webhook["url"]
    secret = webhook.get("secret", "")
    signature = generate_signature(payload_bytes, secret)

    headers = {
        "Content-Type": "application/json",
        "X-CMP-Event": payload_dict["event"],
        "X-CMP-Signature": f"sha256={signature}",
        "X-CMP-Delivery": str(uuid.uuid4()),
    }

    try:
        resp = await client.post(url, content=payload_bytes, headers=headers)
        success = 200 <= resp.status_code < 300
        if not success:
            logger.warning("Webhook %s returned %d", webhook_id, resp.status_code)
        return {
            "webhook_id": webhook_id,
            "url": url,
            "status_code": resp.status_code,
            "success": success,
            "error": None,
        }
    except Exception as exc:
        logger.error("Webhook %s delivery failed: %s", webhook_id, exc)
        return {
            "webhook_id": webhook_id,
            "url": url,
            "status_code": None,
            "success": False,
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Convenience wrappers for common mail events
# ---------------------------------------------------------------------------

async def notify_email_sent(sender: str, recipient: str, domain: str, status: str = "delivered", **extra):
    return await dispatch_event("email.sent", {"sender": sender, "recipient": recipient, "domain": domain, "status": status, **extra})

async def notify_email_bounced(sender: str, recipient: str, domain: str, status: str = "bounced", **extra):
    return await dispatch_event("email.bounced", {"sender": sender, "recipient": recipient, "domain": domain, "status": status, **extra})

async def notify_email_rejected(sender: str, recipient: str, domain: str, status: str = "rejected", **extra):
    return await dispatch_event("email.rejected", {"sender": sender, "recipient": recipient, "domain": domain, "status": status, **extra})

async def notify_email_deferred(sender: str, recipient: str, domain: str, status: str = "deferred", **extra):
    return await dispatch_event("email.deferred", {"sender": sender, "recipient": recipient, "domain": domain, "status": status, **extra})

async def notify_spam_detected(sender: str, recipient: str, domain: str, score: float = 0.0, **extra):
    return await dispatch_event("spam.detected", {"sender": sender, "recipient": recipient, "domain": domain, "score": score, "status": "spam", **extra})

async def notify_virus_detected(sender: str, recipient: str, domain: str, score: float = 0.0, **extra):
    return await dispatch_event("virus.detected", {"sender": sender, "recipient": recipient, "domain": domain, "score": score, "status": "virus", **extra})
