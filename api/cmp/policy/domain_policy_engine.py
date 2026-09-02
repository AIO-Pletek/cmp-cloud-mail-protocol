"""Pure evaluator for tenant/global domain allow/block policy."""
from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from .domain_matcher import matches_any_pattern


class DomainPolicyAction(str, Enum):
    ALLOW = "ALLOW"
    REJECT = "REJECT"


class DomainPolicyReason(str, Enum):
    GLOBAL_BLOCK = "GLOBAL_DOMAIN_BLOCK"
    TENANT_BLOCK = "TENANT_DOMAIN_BLOCK"
    TENANT_ALLOW = "TENANT_DOMAIN_ALLOW"
    GLOBAL_ALLOW = "GLOBAL_DOMAIN_ALLOW"
    TENANT_ALLOWLIST_MISS = "TENANT_DOMAIN_ALLOWLIST_MISS"
    ALLOW_ALL = "DOMAIN_POLICY_ALLOW_ALL"
    UNKNOWN_TENANT = "UNKNOWN_TENANT"


@dataclass(frozen=True)
class DomainPolicyDecision:
    action: DomainPolicyAction
    reason_code: DomainPolicyReason
    matched_rule: str
    domain: str
    scope: str


def evaluate_domain_policy(domain: str, policy: dict) -> DomainPolicyDecision:
    """Evaluate one external domain against resolved global + tenant policy.

    Explicit blocks always win. A global allowlist is a hard global boundary;
    tenant allow entries cannot bypass it. Then tenant allowlist mode is applied.
    ``allow_all`` means unmatched domains are accepted, while explicit blocks
    remain effective in every mode.
    """
    domain = (domain or "").strip().lower()
    if not domain:
        return DomainPolicyDecision(DomainPolicyAction.REJECT, DomainPolicyReason.UNKNOWN_TENANT,
                                    "empty_domain", domain, "system")

    matched, pattern = matches_any_pattern(domain, policy.get("global_domain_block_patterns", []))
    if matched:
        return DomainPolicyDecision(DomainPolicyAction.REJECT, DomainPolicyReason.GLOBAL_BLOCK,
                                    f"global_block:{pattern}", domain, "global")
    matched, pattern = matches_any_pattern(domain, policy.get("tenant_domain_block_patterns", []))
    if matched:
        return DomainPolicyDecision(DomainPolicyAction.REJECT, DomainPolicyReason.TENANT_BLOCK,
                                    f"tenant_block:{pattern}", domain, "tenant")

    global_mode = policy.get("global_domain_mode", "allow_all")
    global_enabled = policy.get("global_domain_policy_enabled", True)
    global_allowed, global_pattern = matches_any_pattern(domain, policy.get("global_domain_allow_patterns", []))
    if global_allowed:
        return DomainPolicyDecision(DomainPolicyAction.ALLOW, DomainPolicyReason.GLOBAL_ALLOW,
                                    f"global_allow:{global_pattern}", domain, "global")
    if global_enabled and global_mode == "allowlist":
        return DomainPolicyDecision(DomainPolicyAction.REJECT, DomainPolicyReason.TENANT_ALLOWLIST_MISS,
                                    "global_allowlist_miss", domain, "global")

    tenant_allowed, tenant_pattern = matches_any_pattern(domain, policy.get("tenant_domain_allow_patterns", []))
    if tenant_allowed:
        return DomainPolicyDecision(DomainPolicyAction.ALLOW, DomainPolicyReason.TENANT_ALLOW,
                                    f"tenant_allow:{tenant_pattern}", domain, "tenant")
    if policy.get("tenant_domain_policy_enabled", True) and policy.get("tenant_domain_mode", "allow_all") == "allowlist":
        return DomainPolicyDecision(DomainPolicyAction.REJECT, DomainPolicyReason.TENANT_ALLOWLIST_MISS,
                                    "tenant_allowlist_miss", domain, "tenant")
    return DomainPolicyDecision(DomainPolicyAction.ALLOW, DomainPolicyReason.ALLOW_ALL,
                                "domain_policy_allow_all", domain, "default")


def evaluate_message_domains(domains: list[str], policy: dict) -> DomainPolicyDecision:
    """All domains must pass. Return the first rejection, else a representative allow."""
    for domain in domains:
        decision = evaluate_domain_policy(domain, policy)
        if decision.action == DomainPolicyAction.REJECT:
            return decision
    return DomainPolicyDecision(DomainPolicyAction.ALLOW, DomainPolicyReason.ALLOW_ALL,
                                "all_recipient_domains_allowed", domains[0] if domains else "", "default")
