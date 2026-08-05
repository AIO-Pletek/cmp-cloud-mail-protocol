import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Text, Enum, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from cmp.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class QuarantineStatus(str, enum.Enum):
    pending = "pending"
    released = "released"
    deleted = "deleted"
    expired = "expired"


class Quarantine(Base):
    __tablename__ = "quarantine"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    domain_id: Mapped[str] = mapped_column(String(36), ForeignKey("domains.id"), nullable=False)
    sender: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(1024), nullable=False)
    body_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    spam_score: Mapped[float] = mapped_column(Float, default=0.0)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[QuarantineStatus] = mapped_column(Enum(QuarantineStatus), default=QuarantineStatus.pending)
    raw_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    headers_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
