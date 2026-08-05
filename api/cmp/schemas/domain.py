from datetime import datetime
from pydantic import BaseModel, Field


class DomainCreate(BaseModel):
    domain_name: str = Field(..., min_length=3, max_length=255)


class DomainRead(BaseModel):
    id: str
    tenant_id: str
    domain_name: str
    is_verified: bool
    dkim_selector: str
    dkim_public_key: str | None
    spf_record: str | None
    dmarc_record: str | None
    mx_record: str | None
    verification_token: str
    is_active: bool
    email_count: int
    spam_blocked: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DomainDetail(DomainRead):
    dns_status: dict | None = None


class DNSCheckResult(BaseModel):
    mx_ok: bool
    spf_ok: bool
    dkim_ok: bool
    dmarc_ok: bool
    details: dict
