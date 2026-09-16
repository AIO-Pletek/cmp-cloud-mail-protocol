"""Webhook management API routes.

Provides CRUD endpoints for webhook registrations and allows
triggering a test event delivery.

All routes are authenticated (CWE-306/862 fix): the caller's tenant id
comes from the JWT, never from a client-supplied header, and object access
is scoped to that tenant (CWE-639/BOLA fix).
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional

from cmp.middleware.auth import get_current_user
from cmp.models.tenant import Tenant
from cmp.services.webhook_service import (
    VALID_EVENTS,
    list_webhooks,
    get_webhook,
    create_webhook,
    update_webhook,
    delete_webhook,
    dispatch_event,
)

router = APIRouter(prefix="/api/v1/webhooks", tags=["Webhooks"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class WebhookCreate(BaseModel):
    url: HttpUrl
    events: list[str] = Field(..., description="List of event types to subscribe to")
    secret: Optional[str] = None
    enabled: bool = True


class WebhookUpdate(BaseModel):
    url: Optional[HttpUrl] = None
    events: Optional[list[str]] = None
    secret: Optional[str] = None
    enabled: Optional[bool] = None


class WebhookRead(BaseModel):
    id: str
    tenant_id: str
    url: str
    events: list[str]
    enabled: bool
    created_at: str
    updated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tenant_scope(tenant: Tenant) -> str | None:
    """Scoping key for list_webhooks: admin sees all, others only their own."""
    if getattr(tenant, "is_admin", False):
        return None
    return tenant.id


def _owned_or_404(webhook_id: str, tenant: Tenant) -> dict:
    """Read a webhook row, enforcing BOLA: non-admins may only touch their own."""
    wh = get_webhook(webhook_id)
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    if not getattr(tenant, "is_admin", False) and wh.get("tenant_id") != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return wh


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[WebhookRead])
async def list_all_webhooks(tenant: Tenant = Depends(get_current_user)):
    """List webhooks visible to the authenticated tenant (admin: all)."""
    return list_webhooks(tenant_id=_tenant_scope(tenant))


@router.get("/events", response_model=list[str])
async def list_valid_events(tenant: Tenant = Depends(get_current_user)):
    """Return the list of supported webhook event types."""
    return VALID_EVENTS


@router.post("", response_model=WebhookRead, status_code=status.HTTP_201_CREATED)
async def create_new_webhook(body: WebhookCreate, tenant: Tenant = Depends(get_current_user)):
    """Register a new webhook endpoint for the authenticated tenant."""
    try:
        wh = await create_webhook(
            tenant_id=tenant.id,
            url=str(body.url),
            events=body.events,
            secret=body.secret,
            enabled=body.enabled,
        )
        return wh
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/{webhook_id}", response_model=WebhookRead)
async def get_single_webhook(webhook_id: str, tenant: Tenant = Depends(get_current_user)):
    """Retrieve a single webhook by ID (own tenant only unless admin)."""
    return _owned_or_404(webhook_id, tenant)


@router.put("/{webhook_id}", response_model=WebhookRead)
async def update_existing_webhook(webhook_id: str, body: WebhookUpdate, tenant: Tenant = Depends(get_current_user)):
    """Update webhook configuration (own tenant only unless admin)."""
    _owned_or_404(webhook_id, tenant)
    fields = body.model_dump(exclude_none=True)
    # Convert HttpUrl to str for storage
    if "url" in fields:
        fields["url"] = str(fields["url"])
    try:
        wh = await update_webhook(webhook_id, **fields)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return wh


@router.delete("/{webhook_id}")
async def delete_existing_webhook(webhook_id: str, tenant: Tenant = Depends(get_current_user)):
    """Delete a webhook (own tenant only unless admin)."""
    _owned_or_404(webhook_id, tenant)
    if not delete_webhook(webhook_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return {"message": "Webhook deleted"}


class TestEventRequest(BaseModel):
    event: str = "email.sent"


@router.post("/{webhook_id}/test")
async def test_webhook(webhook_id: str, body: TestEventRequest = TestEventRequest(), tenant: Tenant = Depends(get_current_user)):
    """Send a test event to a single webhook (own tenant only unless admin)."""
    wh = _owned_or_404(webhook_id, tenant)

    test_data = {
        "sender": "test@example.com",
        "recipient": "user@example.com",
        "domain": "example.com",
        "status": "test",
        "score": 0.0,
    }
    results = await dispatch_event(body.event, test_data, only_webhook_id=webhook_id)
    # Filter to only this webhook's result (already scoped by dispatch)
    result = next((r for r in results if r["webhook_id"] == webhook_id), None)
    if result is None:
        raise HTTPException(status_code=500, detail="No delivery attempted")
    return result