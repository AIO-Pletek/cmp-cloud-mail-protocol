from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class TenantCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    plan: str = Field(default="starter", pattern="^(free|starter|business|enterprise)$")


class TenantRead(BaseModel):
    id: str
    name: str
    slug: str
    email: str
    plan: str
    logo_path: str | None
    primary_color: str
    secondary_color: str
    accent_color: str
    custom_domain: str | None
    api_key: str
    is_active: bool
    is_admin: bool = Field(default=False, alias="isAdmin")
    notification_emails: str = ""
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class TenantUpdate(BaseModel):
    name: str | None = None
    plan: str | None = None
    is_active: bool | None = None
    notification_emails: str | None = None


class TenantBranding(BaseModel):
    logo_path: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    custom_domain: str | None = None
