import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, Text, Enum, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from cmp.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class RuleTypeEnum(str, enum.Enum):
    whitelist = "whitelist"
    blacklist = "blacklist"
    content_filter = "content_filter"


class MatchTypeEnum(str, enum.Enum):
    exact = "exact"
    regex = "regex"
    contains = "contains"


class ActionEnum(str, enum.Enum):
    allow = "allow"
    block = "block"
    quarantine = "quarantine"


class FilterRule(Base):
    __tablename__ = "filter_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    domain_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("domains.id"), nullable=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    rule_type: Mapped[RuleTypeEnum] = mapped_column(Enum(RuleTypeEnum), nullable=False)
    match_type: Mapped[MatchTypeEnum] = mapped_column(Enum(MatchTypeEnum), nullable=False)
    pattern: Mapped[str] = mapped_column(String(512), nullable=False)
    action: Mapped[ActionEnum] = mapped_column(Enum(ActionEnum), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
