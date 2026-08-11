"""Policy Engine __init__ — exports public API."""
from .policy_engine import (
    PolicyEngine,
    PolicyEngineConfig,
    PolicyContext,
    PolicyDecision,
    AttachmentMeta,
    Direction,
    Action,
    ReasonCode,
    build_config_from_db,
)
from .domain_matcher import (
    matches_domain_pattern,
    matches_any_pattern,
    email_matches_pattern,
    normalize_email,
    email_domain,
)

__all__ = [
    "PolicyEngine", "PolicyEngineConfig", "PolicyContext", "PolicyDecision",
    "AttachmentMeta", "Direction", "Action", "ReasonCode", "build_config_from_db",
    "matches_domain_pattern", "matches_any_pattern", "email_matches_pattern",
    "normalize_email", "email_domain",
]
