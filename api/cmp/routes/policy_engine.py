"""
Policy Engine API routes.
CRUD for global whitelist, personal whitelist, CRO accounts.
Evaluate endpoint for testing policy decisions.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import HTMLResponse
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
from cmp.policy.domain_policy_engine import evaluate_message_domains, DomainPolicyAction
from cmp.services.domain_approval_service import (
    init_approval_tables, list_approvals, list_all_approvals,
    get_approval_by_token, process_approval, create_and_notify, ApprovalProcessingError,
)
from cmp.policy.domain_policy_store import (
    init_domain_policy_tables, get_settings as get_domain_settings,
    save_settings as save_domain_settings, get_global_settings as get_global_domain_settings,
    save_global_settings as save_global_domain_settings, list_rules as list_domain_rules,
    add_rule as add_domain_rule, delete_rule as delete_domain_rule,
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


class DomainSettingsBody(BaseModel):
    mode: str = "allow_all"
    enabled: bool = True


class DomainRuleCreate(BaseModel):
    action: str
    pattern: str
    description: Optional[str] = ""


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


@router.get("/domain-policy/settings")
async def get_domain_policy_settings(tenant=Depends(get_current_user)):
    return {"tenant": await get_domain_settings(tenant.id), "global": await get_global_domain_settings()}


@router.put("/domain-policy/settings")
async def update_domain_policy_settings(req: DomainSettingsBody, tenant=Depends(get_current_user)):
    if req.mode not in ("allow_all", "allowlist"):
        raise HTTPException(status_code=400, detail="mode must be allow_all or allowlist")
    return await save_domain_settings(tenant.id, req.mode, req.enabled)


@router.put("/domain-policy/global-settings")
async def update_global_domain_policy_settings(req: DomainSettingsBody, tenant=Depends(require_admin)):
    if req.mode not in ("allow_all", "allowlist"):
        raise HTTPException(status_code=400, detail="mode must be allow_all or allowlist")
    return await save_global_domain_settings(req.mode, req.enabled)


@router.get("/domain-policy/rules")
async def get_domain_policy_rules(tenant=Depends(get_current_user)):
    return {"tenant": await list_domain_rules("tenant", tenant.id),
            "global": await list_domain_rules("global") if tenant.is_admin else []}


@router.post("/domain-policy/rules")
async def create_domain_policy_rule(req: DomainRuleCreate, tenant=Depends(get_current_user)):
    if req.action not in ("allow", "block") or not req.pattern.strip():
        raise HTTPException(status_code=400, detail="action must be allow/block and pattern is required")
    return await add_domain_rule("tenant", tenant.id, req.action, req.pattern, req.description or "")


@router.post("/domain-policy/global-rules")
async def create_global_domain_policy_rule(req: DomainRuleCreate, tenant=Depends(require_admin)):
    if req.action not in ("allow", "block") or not req.pattern.strip():
        raise HTTPException(status_code=400, detail="action must be allow/block and pattern is required")
    return await add_domain_rule("global", None, req.action, req.pattern, req.description or "")


@router.delete("/domain-policy/rules/{rule_id}")
async def remove_domain_policy_rule(rule_id: str, tenant=Depends(get_current_user)):
    if not await delete_domain_rule(rule_id, "tenant", tenant.id):
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"deleted": rule_id}


@router.delete("/domain-policy/global-rules/{rule_id}")
async def remove_global_domain_policy_rule(rule_id: str, tenant=Depends(require_admin)):
    if not await delete_domain_rule(rule_id, "global"):
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"deleted": rule_id}


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
    # Domain allow/block policy is evaluated before the legacy policy engine.
    from cmp.policy.domain_policy_store import load_domain_policy
    from cmp.policy.domain_matcher import email_domain
    direction = Direction(req.direction.upper())
    domain_policy = await load_domain_policy(tenant.id)
    domain_candidates = ([email_domain(req.sender)] if direction == Direction.INBOUND
                         else [email_domain(r) for r in req.recipients])
    domain_decision = evaluate_message_domains(domain_candidates, domain_policy)
    if domain_decision.action == DomainPolicyAction.REJECT:
        return {
            "action": "BOUNCE", "reason_code": domain_decision.reason_code.value,
            "notify_recipient": False, "bounce_sender": True,
            "matched_rule": domain_decision.matched_rule, "direction": direction.value,
            "per_recipient": {},
        }

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


# ── Domain Approval Routes ─────────────────────────────────────────────────

class ApprovalActionBody(BaseModel):
    add_to_allowlist: bool = False


@router.get("/domain-approvals")
async def get_domain_approvals(status: Optional[str] = None, tenant=Depends(get_current_user)):
    """List domain approval requests. Admin sees all tenants."""
    await init_approval_tables()
    if getattr(tenant, "is_admin", False):
        return await list_all_approvals(status)
    return await list_approvals(tenant.id, status)


async def _process_approval_or_409(approval_id: str, action: str, actioned_by: str, add_to_allowlist: bool = False):
    try:
        return await process_approval(approval_id, action, actioned_by, add_to_allowlist)
    except ApprovalProcessingError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/domain-approvals/{approval_id}/approve")
async def approve_domain_request(
    approval_id: str, body: ApprovalActionBody = ApprovalActionBody(),
    tenant=Depends(get_current_user)
):
    return await _process_approval_or_409(approval_id, "approve", tenant.email, body.add_to_allowlist)


@router.post("/domain-approvals/{approval_id}/reject")
async def reject_domain_request(approval_id: str, tenant=Depends(get_current_user)):
    return await _process_approval_or_409(approval_id, "reject", tenant.email, False)


def _approval_action_page(approval: dict, token: str, action: str) -> str:
    from html import escape
    label = "Approve and release" if action == "approve" else "Reject and delete"
    color = "#059669" if action == "approve" else "#dc2626"
    status = str(approval.get("status", "pending"))
    if status != "pending":
        return ("<!doctype html><html><body style='font-family:system-ui;background:#f3f4f6;padding:32px'>"
                f"<main style='max-width:560px;margin:auto;background:white;border-radius:14px;padding:32px'><h2>Approval already {escape(status)}</h2>"
                "<p>This request has already been actioned. No mail-flow change was made by this page.</p></main></body></html>")
    sender = escape(str(approval.get("sender", "")), quote=True)
    recipient = escape(str(approval.get("recipient", "")), quote=True)
    domain = escape(str(approval.get("sender_domain", "")), quote=True)
    subject = escape(str(approval.get("subject", "") or "(not available)"), quote=True)
    action_url = escape(f"/api/v1/policy/domain-approvals/action?token={token}&action={action}", quote=True)
    return ("<!doctype html><html><head><meta charset='utf-8'><meta name='robots' content='noindex,nofollow'>"
            "<title>Confirm domain approval</title></head><body style='font-family:system-ui;background:#f3f4f6;padding:32px'>"
            "<main style='max-width:600px;margin:auto;background:white;border-radius:14px;overflow:hidden'>"
            "<header style='background:#1d4ed8;color:white;padding:24px 32px'><h1>Confirm email action</h1>"
            "<p>This preview is safe. The action happens only after confirmation.</p></header>"
            f"<section style='padding:28px 32px'><p><b>From:</b> {sender}</p><p><b>Domain:</b> {domain}</p>"
            f"<p><b>To:</b> {recipient}</p><p><b>Subject:</b> {subject}</p>"
            f"<form method='post' action='{action_url}'><button type='submit' style='background:{color};color:white;border:0;border-radius:8px;padding:13px 20px;font-size:15px;font-weight:600'>{label}</button></form>"
            "<p style='color:#6b7280;font-size:12px'>Mail scanners cannot execute the POST confirmation.</p></section></main></body></html>")


@router.get("/domain-approvals/action", response_class=HTMLResponse)
async def approval_action_preview(token: str, action: str):
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")
    approval = await get_approval_by_token(token, action)
    if not approval:
        raise HTTPException(status_code=404, detail="Invalid or expired token")
    return HTMLResponse(_approval_action_page(approval, token, action), headers={"Cache-Control": "no-store, no-cache, must-revalidate", "X-Robots-Tag": "noindex, nofollow"})


@router.post("/domain-approvals/action")
async def approval_action_confirm(token: str, action: str):
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")
    approval = await get_approval_by_token(token, action)
    if not approval:
        raise HTTPException(status_code=404, detail="Invalid or expired token")
    result = await _process_approval_or_409(str(approval["id"]), action, "email_link", False)
    label = "approved and released" if action == "approve" else "rejected and deleted"
    return {"message": f"Email from {approval['sender_domain']} has been {label}.", "status": result["status"], "sender": approval["sender"], "recipient": approval["recipient"]}
