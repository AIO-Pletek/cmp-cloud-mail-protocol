"""Webhook management API routes.

Provides CRUD endpoints for webhook registrations and allows
triggering a test event delivery.
"""

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional

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
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[WebhookRead])
async def list_all_webhooks(request: Request):
    """List webhooks for the authenticated tenant."""
    tenant_id = request.headers.get("X-Tenant-Id", "default")
    return list_webhooks(tenant_id=tenant_id)


@router.get("/events", response_model=list[str])
async def list_valid_events():
    """Return the list of supported webhook event types."""
    return VALID_EVENTS


@router.post("", response_model=WebhookRead, status_code=status.HTTP_201_CREATED)
async def create_new_webhook(body: WebhookCreate, request: Request):
    """Register a new webhook endpoint."""
    tenant_id = request.headers.get("X-Tenant-Id", "default")
    try:
        wh = create_webhook(
            tenant_id=tenant_id,
            url=str(body.url),
            events=body.events,
            secret=body.secret,
            enabled=body.enabled,
        )
        return wh
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/{webhook_id}", response_model=WebhookRead)
async def get_single_webhook(webhook_id: str):
    """Retrieve a single webhook by ID."""
    wh = get_webhook(webhook_id)
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return wh


@router.put("/{webhook_id}", response_model=WebhookRead)
async def update_existing_webhook(webhook_id: str, body: WebhookUpdate):
    """Update webhook configuration."""
    fields = body.model_dump(exclude_none=True)
    # Convert HttpUrl to str for storage
    if "url" in fields:
        fields["url"] = str(fields["url"])
    try:
        wh = update_webhook(webhook_id, **fields)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return wh


@router.delete("/{webhook_id}")
async def delete_existing_webhook(webhook_id: str):
    """Delete a webhook."""
    if not delete_webhook(webhook_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return {"message": "Webhook deleted"}


class TestEventRequest(BaseModel):
    event: str = "email.sent"


@router.post("/{webhook_id}/test")
async def test_webhook(webhook_id: str, body: TestEventRequest = TestEventRequest()):
    """Send a test event to a specific webhook."""
    wh = get_webhook(webhook_id)
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    test_data = {
        "sender": "test@example.com",
        "recipient": "user@example.com",
        "domain": "example.com",
        "status": "test",
        "score": 0.0,
    }
    results = await dispatch_event(body.event, test_data)
    # Filter to only this webhook's result
    result = next((r for r in results if r["webhook_id"] == webhook_id), None)
    if result is None:
        raise HTTPException(status_code=500, detail="No delivery attempted")
    return result
