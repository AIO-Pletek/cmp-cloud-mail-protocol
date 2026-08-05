from datetime import datetime
from pydantic import BaseModel, Field


class FilterRuleCreate(BaseModel):
    domain_id: str | None = None
    rule_type: str = Field(..., pattern="^(whitelist|blacklist|content_filter)$")
    match_type: str = Field(..., pattern="^(exact|regex|contains)$")
    pattern: str = Field(..., min_length=1, max_length=512)
    action: str = Field(..., pattern="^(allow|block|quarantine)$")
    priority: int = Field(default=0, ge=0)
    description: str | None = None


class FilterRuleRead(BaseModel):
    id: str
    domain_id: str | None
    tenant_id: str
    rule_type: str
    match_type: str
    pattern: str
    action: str
    priority: int
    is_active: bool
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FilterRuleUpdate(BaseModel):
    domain_id: str | None = None
    rule_type: str | None = None
    match_type: str | None = None
    pattern: str | None = None
    action: str | None = None
    priority: int | None = None
    is_active: bool | None = None
    description: str | None = None
