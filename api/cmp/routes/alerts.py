"""Email alerts API routes."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from cmp.services.alert_service import (
    list_alerts, create_alert, delete_alert, toggle_alert, VALID_EVENTS, EVENT_LABELS
)
from cmp.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/alerts", tags=["Email Alerts"])


class CreateAlertRequest(BaseModel):
    email: str
    events: list[str]
    domain: str | None = None
    label: str | None = None


class ToggleRequest(BaseModel):
    enabled: bool


@router.get("")
async def get_alerts(tenant=Depends(get_current_user)):
    return list_alerts()


@router.get("/events")
async def get_events(tenant=Depends(get_current_user)):
    return [{"value": e, "label": EVENT_LABELS.get(e, e)} for e in VALID_EVENTS]


@router.post("")
async def add_alert(req: CreateAlertRequest, tenant=Depends(get_current_user)):
    invalid = [e for e in req.events if e not in VALID_EVENTS]
    if invalid:
        raise HTTPException(400, f"Invalid events: {invalid}")
    return create_alert(req.email, req.events, req.domain, req.label)


@router.delete("/{alert_id}")
async def remove_alert(alert_id: str, tenant=Depends(get_current_user)):
    delete_alert(alert_id)
    return {"message": "Alert deleted"}


@router.put("/{alert_id}/toggle")
async def toggle(alert_id: str, req: ToggleRequest, tenant=Depends(get_current_user)):
    toggle_alert(alert_id, req.enabled)
    return {"message": "Updated"}
