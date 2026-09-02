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


# --- Sub-resource endpoints (portal contract) ---

class ExtensionCreate(BaseModel):
    extension: str
    list_type: str = "blacklist"
    action: str = "block"
    description: Optional[str] = ""

class MimeCreate(BaseModel):
    mime_type: str
    list_type: str = "blacklist"
    action: str = "block"

class SizeLimitCreate(BaseModel):
    domain: Optional[str] = None
    max_size_mb: int


def _by_type(tenant_id, t):
    return [p for p in list_policies(tenant_id) if p.get("type") == t]

def _shape(t, p):
    if t == "extension":
        return {**p, "extension": p.get("value")}
    if t == "mime":
        return {**p, "mime_type": p.get("value")}
    if t == "size":
        try:
            return {**p, "max_size_mb": int(p.get("value") or 0)}
        except (TypeError, ValueError):
            return {**p, "max_size_mb": 0}
    return p

def _mutate(fn, *args):
    r = fn(*args)
    sync_to_postfix()
    return r


@router.get("/extensions")
async def list_extensions(tenant=Depends(get_current_user)):
    return {
        "defaults": [{"extension": e, "list_type": "block", "action": "block"} for e in get_defaults()["blocked_extensions"]],
        "custom": [_shape("extension", p) for p in _by_type(tenant.id, "extension")],
    }

@router.post("/extensions")
async def create_extension(req: ExtensionCreate, tenant=Depends(get_current_user)):
    return _mutate(create_policy, tenant.id, {"type": "extension", "value": req.extension, "list_type": req.list_type, "action": req.action, "description": req.description})

@router.delete("/extensions/{policy_id}")
async def delete_extension(policy_id: str, tenant=Depends(get_current_user)):
    return _mutate(delete_policy, policy_id)

@router.put("/extensions/{policy_id}")
async def toggle_extension(policy_id: str, body: ToggleBody, tenant=Depends(get_current_user)):
    return _mutate(toggle_policy, policy_id, body.enabled)


@router.get("/mime-types")
async def list_mime_types(tenant=Depends(get_current_user)):
    return {
        "defaults": [{"mime_type": m, "list_type": "block", "action": "block"} for m in get_defaults()["blocked_mime_types"]],
        "custom": [_shape("mime", p) for p in _by_type(tenant.id, "mime")],
    }

@router.post("/mime-types")
async def create_mime_type(req: MimeCreate, tenant=Depends(get_current_user)):
    return _mutate(create_policy, tenant.id, {"type": "mime", "value": req.mime_type, "list_type": req.list_type, "action": req.action, "description": ""})

@router.delete("/mime-types/{policy_id}")
async def delete_mime_type(policy_id: str, tenant=Depends(get_current_user)):
    return _mutate(delete_policy, policy_id)

@router.put("/mime-types/{policy_id}")
async def toggle_mime_type(policy_id: str, body: ToggleBody, tenant=Depends(get_current_user)):
    return _mutate(toggle_policy, policy_id, body.enabled)


@router.get("/size-limits")
async def list_size_limits(tenant=Depends(get_current_user)):
    return {"limits": [_shape("size", p) for p in _by_type(tenant.id, "size")]}

@router.post("/size-limits")
async def create_size_limit(req: SizeLimitCreate, tenant=Depends(get_current_user)):
    return _mutate(create_policy, tenant.id, {"type": "size", "value": str(req.max_size_mb), "domain": req.domain, "action": "block", "description": ""})

@router.delete("/size-limits/{policy_id}")
async def delete_size_limit(policy_id: str, tenant=Depends(get_current_user)):
    return _mutate(delete_policy, policy_id)
