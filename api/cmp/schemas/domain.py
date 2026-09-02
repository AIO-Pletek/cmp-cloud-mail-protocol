from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class DomainCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    domain_name: str = Field(..., min_length=3, max_length=255, alias='domainName')


class DomainRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: str
    tenant_id: str = Field(alias='tenantId')
    domain_name: str = Field(alias='domainName')
    is_verified: bool = Field(alias='isVerified')
    dkim_selector: str = Field(alias='dkimSelector')
    dkim_public_key: str | None = Field(None, alias='dkimPublicKey')
    spf_record: str | None = Field(None, alias='spfRecord')
    dmarc_record: str | None = Field(None, alias='dmarcRecord')
    mx_record: str | None = Field(None, alias='mxRecord')
    verification_token: str = Field(alias='verificationToken')
    is_active: bool = Field(alias='isActive')
    email_count: int = Field(alias='emailCount')
    spam_blocked: int = Field(alias='spamBlocked')
    created_at: datetime = Field(alias='createdAt')
    updated_at: datetime = Field(alias='updatedAt')


class DomainDetail(DomainRead):
    dns_status: dict | None = Field(None, alias='dnsStatus')


class DNSCheckResult(BaseModel):
    mx_ok: bool = Field(alias='mxOk')
    spf_ok: bool = Field(alias='spfOk')
    dkim_ok: bool = Field(alias='dkimOk')
    dmarc_ok: bool = Field(alias='dmarcOk')
    details: dict
