from pydantic import BaseModel


class TrafficStats(BaseModel):
    period: str
    total_incoming: int
    total_outgoing: int
    total_spam: int
    total_virus: int
    by_domain: list[dict]
    by_hour: list[dict]


class SpamStats(BaseModel):
    total_spam: int
    spam_ratio: float
    top_spam_senders: list[dict]
    by_reason: list[dict]


class DomainHealth(BaseModel):
    domain: str
    mx_status: str
    spf_status: str
    dkim_status: str
    dmarc_status: str
    score: float
