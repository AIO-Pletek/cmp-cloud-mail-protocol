import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from cmp.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Domain(Base):
    __tablename__ = "domains"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    domain_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    dkim_selector: Mapped[str] = mapped_column(String(64), default="cmp")
    dkim_public_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    spf_record: Mapped[str | None] = mapped_column(Text, nullable=True)
    dmarc_record: Mapped[str | None] = mapped_column(Text, nullable=True)
    mx_record: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_token: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_count: Mapped[int] = mapped_column(Integer, default=0)
    spam_blocked: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
