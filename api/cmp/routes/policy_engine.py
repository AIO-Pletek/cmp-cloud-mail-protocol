"""
Policy Engine API routes.
CRUD for global whitelist, personal whitelist, CRO accounts.
Evaluate endpoint for testing policy decisions.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from cmp.middleware.auth import get_current_user, require_admin
from cmp.policy.policy_store import (
    init_policy_tables,
    list_global_whitelist, add_global_whitelist, delete_global_whitelist, toggle_global_whitelist,
    list_personal_whitelist, add_personal_whitelist, delete_personal_whitelist,
    list_cro_accounts, add_cro_account, delete_cro_account,
    list_audit_log, load_policy_config, write_audit_log,
)
from cmp.policy.policy_engine import (
    PolicyEngine, PolicyContext, AttachmentMeta, Direction, build_config_from_db
)

router = APIRouter(prefix="/api/v1/policy", tags=["Policy Engine"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class GlobalWLCreate(BaseModel):
    pattern: str
    description: Optional[str] = ""


class PersonalWLCreate(BaseModel):
    account: str
    allowed: str
    description: Optional[str] = ""


class CROCreate(BaseModel):
    account_pattern: str
    branch_name: Optional[str] = ""
    description: Optional[str] = ""


class ToggleBody(BaseModel):
    enabled: bool


class EvaluateRequest(BaseModel):
    """Manual policy evaluation — for testing/debugging."""
    message_id: str = "test-001"
    direction: str  # INBOUND | OUTBOUND
    sender: str
    recipients: List[str]
    subject: str = ""
    # Optional attachment info
    attachments: List[dict] = []
    sender_is_cro: bool = False
    # If True, will also write an audit log entry
    audit: bool = False


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

@router.post("/init-tables")
async def init_tables(tenant=Depends(require_admin)):
    await init_policy_tables()
    return {"message": "Policy tables initialized"}


# ---------------------------------------------------------------------------
# Global Whitelist
# ---------------------------------------------------------------------------

@router.get("/global-whitelist")
async def list_gw(tenant=Depends(get_current_user)):
    return await list_global_whitelist(tenant.id)


@router.post("/global-whitelist")
async def add_gw(req: GlobalWLCreate, tenant=Depends(require_admin)):
    if not req.pattern.strip():
        raise HTTPException(status_code=400, detail="Pattern is required")
    return await add_global_whitelist(tenant.id, req.pattern, req.description or "")


@router.delete("/global-whitelist/{entry_id}")
async def del_gw(entry_id: str, tenant=Depends(require_admin)):
    deleted = await delete_global_whitelist(entry_id, tenant.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": entry_id}


@router.put("/global-whitelist/{entry_id}/toggle")
async def toggle_gw(entry_id: str, body: ToggleBody, tenant=Depends(require_admin)):
    result = await toggle_global_whitelist(entry_id, tenant.id, body.enabled)
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return result


# ---------------------------------------------------------------------------
# Personal Whitelist
# ---------------------------------------------------------------------------

@router.get("/personal-whitelist")
async def list_pw(account: Optional[str] = Query(None), tenant=Depends(get_current_user)):
    return await list_personal_whitelist(tenant.id, account)


@router.post("/personal-whitelist")
async def add_pw(req: PersonalWLCreate, tenant=Depends(get_current_user)):
    if not req.account.strip() or not req.allowed.strip():
        raise HTTPException(status_code=400, detail="account and allowed are required")
    return await add_personal_whitelist(tenant.id, req.account, req.allowed, req.description or "")


@router.delete("/personal-whitelist/{entry_id}")
async def del_pw(entry_id: str, tenant=Depends(get_current_user)):
    deleted = await delete_personal_whitelist(entry_id, tenant.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": entry_id}


# ---------------------------------------------------------------------------
# CRO Accounts
# ---------------------------------------------------------------------------

@router.get("/cro-accounts")
async def list_cro(tenant=Depends(require_admin)):
    return await list_cro_accounts(tenant.id)


@router.post("/cro-accounts")
async def add_cro(req: CROCreate, tenant=Depends(require_admin)):
    if not req.account_pattern.strip():
        raise HTTPException(status_code=400, detail="account_pattern is required")
    return await add_cro_account(tenant.id, req.account_pattern, req.branch_name or "", req.description or "")


@router.delete("/cro-accounts/{entry_id}")
async def del_cro(entry_id: str, tenant=Depends(require_admin)):
    deleted = await delete_cro_account(entry_id, tenant.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": entry_id}


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

@router.get("/audit-log")
async def get_audit(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    tenant=Depends(get_current_user)
):
    return await list_audit_log(tenant.id, limit, offset)


# ---------------------------------------------------------------------------
# Evaluate (test/debug)
# ---------------------------------------------------------------------------

@router.post("/evaluate")
async def evaluate_policy(req: EvaluateRequest, tenant=Depends(get_current_user)):
    """
    Evaluate a policy decision given email metadata.
    Used for testing rules before they affect live mail flow.
    """
    # Load config from DB
    cfg_data = await load_policy_config(tenant.id)
    config = build_config_from_db(**cfg_data)
    engine = PolicyEngine(config)

    # Build context
    from cmp.policy.domain_matcher import email_domain, normalize_email
    attachments = [
        AttachmentMeta(
            filename=a.get("filename", ""),
            mime_type=a.get("mime_type", ""),
            extension=a.get("extension", ""),
            size=a.get("size", 0),
            password_protected=a.get("password_protected"),
            inspection_status=a.get("inspection_status", "unknown"),
        )
        for a in (req.attachments or [])
    ]

    ctx = PolicyContext(
        message_id=req.message_id,
        direction=Direction(req.direction.upper()),
        sender=normalize_email(req.sender),
        recipients=[normalize_email(r) for r in req.recipients],
        sender_domain=email_domain(req.sender),
        recipient_domains=[email_domain(r) for r in req.recipients],
        subject=req.subject,
        attachments=attachments,
        sender_is_cro=req.sender_is_cro,
    )

    decision = engine.evaluate(ctx)

    if req.audit:
        await write_audit_log(
            tenant_id=tenant.id,
            message_id=req.message_id,
            direction=ctx.direction.value,
            sender=ctx.sender,
            recipients=ctx.recipients,
            action=decision.action.value,
            reason_code=decision.reason_code.value,
            matched_rule=decision.matched_rule,
            notify_recipient=decision.notify_recipient,
            bounce_sender=decision.bounce_sender,
            attachment_count=len(attachments),
            has_unprotected_attachment=any(
                a.password_protected is False for a in attachments
            ),
        )

    return decision.to_dict()

# ---------------------------------------------------------------------------
# Policy Settings
# ---------------------------------------------------------------------------

from cmp.policy.policy_store import (
    load_policy_settings, save_policy_settings,
    update_global_whitelist, update_personal_whitelist,
    update_cro_account, toggle_personal_whitelist
)


class PolicySettings(BaseModel):
    require_attachment_password: bool = True
    fail_closed_on_inspection_failure: bool = True
    priority_order: list = ["attachment_security","cro","personal_whitelist","global_whitelist","default"]
    inbound_default_action: str = "quarantine"
    outbound_default_action: str = "bounce"
    notify_recipient_on_quarantine: bool = True
    bounce_message: str = "Email not permitted: recipient not in approved whitelist."
    quarantine_message: str = "Email held for review: sender not in approved whitelist."
    description: str = ""


@router.get("/settings")
async def get_settings(tenant=Depends(get_current_user)):
    return await load_policy_settings(tenant.id)


@router.put("/settings")
async def update_settings(req: PolicySettings, tenant=Depends(get_current_user)):
    data = req.model_dump()
    return await save_policy_settings(tenant.id, data)


# ---------------------------------------------------------------------------
# Edit endpoints
# ---------------------------------------------------------------------------

class GlobalWLUpdate(BaseModel):
    pattern: str
    description: Optional[str] = ""


class PersonalWLUpdate(BaseModel):
    allowed: str
    description: Optional[str] = ""


class CROUpdate(BaseModel):
    account_pattern: str
    branch_name: Optional[str] = ""
    description: Optional[str] = ""


@router.put("/global-whitelist/{entry_id}")
async def edit_gw(entry_id: str, req: GlobalWLUpdate, tenant=Depends(require_admin)):
    result = await update_global_whitelist(entry_id, tenant.id, req.pattern, req.description or "")
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return result


@router.put("/personal-whitelist/{entry_id}")
async def edit_pw(entry_id: str, req: PersonalWLUpdate, tenant=Depends(get_current_user)):
    result = await update_personal_whitelist(entry_id, tenant.id, req.allowed, req.description or "")
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return result


@router.put("/personal-whitelist/{entry_id}/toggle")
async def toggle_pw(entry_id: str, body: ToggleBody, tenant=Depends(get_current_user)):
    result = await toggle_personal_whitelist(entry_id, tenant.id, body.enabled)
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return result


@router.put("/cro-accounts/{entry_id}")
async def edit_cro(entry_id: str, req: CROUpdate, tenant=Depends(require_admin)):
    result = await update_cro_account(entry_id, tenant.id, req.account_pattern, req.branch_name or "", req.description or "")
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return result
