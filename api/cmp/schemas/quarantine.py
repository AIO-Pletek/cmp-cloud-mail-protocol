from datetime import datetime
from pydantic import BaseModel


class QuarantineRead(BaseModel):
    id: str
    domain_id: str
    sender: str
    recipient: str
    subject: str
    body_preview: str | None
    spam_score: float
    reason: str
    status: str
    created_at: datetime
    updated_at: datetime
    released_at: datetime | None

    model_config = {"from_attributes": True}


class QuarantineDetail(QuarantineRead):
    headers_json: str | None = None
    raw_path: str | None = None


class QuarantineStats(BaseModel):
    total: int
    pending: int
    released: int
    deleted: int
    expired: int
    avg_spam_score: float
