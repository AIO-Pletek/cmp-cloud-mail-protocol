from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cmp.database import get_db
from cmp.models.tenant import Tenant
from cmp.models.domain import Domain
from cmp.models.filter_rule import FilterRule
from cmp.schemas.filter_rule import FilterRuleCreate, FilterRuleRead, FilterRuleUpdate
from cmp.middleware.auth import get_current_user
from cmp.middleware.audit import log_audit
from cmp.services import rspamd_service

router = APIRouter(prefix="/api/v1/filters", tags=["Filters"])


@router.post("/", response_model=FilterRuleRead, status_code=status.HTTP_201_CREATED)
async def create_rule(
    req: FilterRuleCreate,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.domain_id:
        result = await db.execute(select(Domain).where(Domain.id == req.domain_id, Domain.tenant_id == tenant.id))
        domain = result.scalar_one_or_none()
        if not domain:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    rule = FilterRule(
        domain_id=req.domain_id,
        tenant_id=tenant.id,
        rule_type=req.rule_type,
        match_type=req.match_type,
        pattern=req.pattern,
        action=req.action,
        priority=req.priority,
        description=req.description,
    )
    db.add(rule)
    await db.flush()

    # Apply to rspamd if domain-specific
    if req.domain_id:
        domain_result = await db.execute(select(Domain).where(Domain.id == req.domain_id))
        domain_obj = domain_result.scalar_one_or_none()
        if domain_obj:
            try:
                if req.rule_type == "whitelist":
                    await rspamd_service.add_whitelist(domain_obj.domain_name, req.pattern)
                elif req.rule_type == "blacklist":
                    await rspamd_service.add_blacklist(domain_obj.domain_name, req.pattern)
                elif req.rule_type == "content_filter":
                    await rspamd_service.add_content_filter(domain_obj.domain_name, req.pattern, req.action)
            except Exception:
                pass

    await log_audit(db, tenant.id, tenant.email, "create", "filter_rule", rule.id, details=req.model_dump(), ip_address=request.client.host if request.client else None)
    await db.refresh(rule)
    return rule


@router.get("/", response_model=list[FilterRuleRead])
async def list_rules(
    domain_id: str | None = Query(None),
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FilterRule).where(FilterRule.tenant_id == tenant.id)
    if domain_id:
        query = query.where(FilterRule.domain_id == domain_id)
    result = await db.execute(query.order_by(FilterRule.priority.desc()))
    return list(result.scalars().all())


@router.put("/{rule_id}", response_model=FilterRuleRead)
async def update_rule(
    rule_id: str,
    req: FilterRuleUpdate,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FilterRule).where(FilterRule.id == rule_id, FilterRule.tenant_id == tenant.id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await db.flush()
    await log_audit(db, tenant.id, tenant.email, "update", "filter_rule", rule_id, details=update_data, ip_address=request.client.host if request.client else None)
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: str,
    request: Request,
    tenant: Tenant = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FilterRule).where(FilterRule.id == rule_id, FilterRule.tenant_id == tenant.id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

    # Remove from rspamd if domain-specific
    if rule.domain_id:
        domain_result = await db.execute(select(Domain).where(Domain.id == rule.domain_id))
        domain_obj = domain_result.scalar_one_or_none()
        if domain_obj:
            try:
                await rspamd_service.remove_rule(domain_obj.domain_name, rule.rule_type.value, rule.pattern)
            except Exception:
                pass

    await db.delete(rule)
    await db.flush()
    await log_audit(db, tenant.id, tenant.email, "delete", "filter_rule", rule_id, ip_address=request.client.host if request.client else None)
    return {"message": "Rule deleted"}


@router.get("/templates")
async def get_templates(tenant: Tenant = Depends(get_current_user)):
    return {
        "templates": [
            {
                "name": "Block known spam domains",
                "rule_type": "blacklist",
                "match_type": "contains",
                "pattern": "spam-domain.com",
                "action": "block",
                "description": "Blocks all emails from known spam domains",
            },
            {
                "name": "Whitelist corporate partner",
                "rule_type": "whitelist",
                "match_type": "exact",
                "pattern": "partner@example.com",
                "action": "allow",
                "description": "Always allow emails from trusted partner",
            },
            {
                "name": "Quarantine suspicious attachments",
                "rule_type": "content_filter",
                "match_type": "regex",
                "pattern": r"(?i)Content-Type:.*application/(x-msdownload|octet-stream|exe)",
                "action": "quarantine",
                "description": "Quarantine emails with executable attachments",
            },
            {
                "name": "Block phishing keywords",
                "rule_type": "content_filter",
                "match_type": "regex",
                "pattern": r"(?i)(verify your account|suspended|click here immediately|urgent action required)",
                "action": "quarantine",
                "description": "Quarantine emails with common phishing phrases",
            },
            {
                "name": "Allow internal domain",
                "rule_type": "whitelist",
                "match_type": "contains",
                "pattern": "@yourcompany.com",
                "action": "allow",
                "description": "Always allow internal emails",
            },
        ]
    }
