"""Attachment policy routes."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from cmp.middleware.auth import get_current_user
from cmp.services.attachment_policy_service import (
    list_policies, create_policy, delete_policy, toggle_policy, sync_to_postfix, get_defaults
)

router = APIRouter(prefix="/api/v1/attachment-policy", tags=["Attachment Policy"])


class PolicyCreate(BaseModel):
    domain: Optional[str] = None
    type: str = "extension"
    value: str
    list_type: str = "blacklist"
    action: str = "block"
    description: Optional[str] = ""


class ToggleBody(BaseModel):
    enabled: bool


@router.get("")
async def list_all(tenant=Depends(get_current_user)):
    return list_policies(tenant.id)


@router.get("/defaults")
async def defaults(tenant=Depends(get_current_user)):
    return get_defaults()


@router.post("")
async def create(req: PolicyCreate, tenant=Depends(get_current_user)):
    return create_policy(tenant.id, req.model_dump())


@router.delete("/{policy_id}")
async def delete(policy_id: str, tenant=Depends(get_current_user)):
    return delete_policy(policy_id)


@router.put("/{policy_id}/toggle")
async def toggle(policy_id: str, body: ToggleBody, tenant=Depends(get_current_user)):
    return toggle_policy(policy_id, body.enabled)


@router.post("/sync")
async def sync(tenant=Depends(get_current_user)):
    return sync_to_postfix()
