"""
Email Security Policy Engine — core evaluation logic.

Priority (highest to lowest):
  1. Outbound Attachment Security  (MANDATORY, cannot be bypassed by whitelist)
  2. CRO Policy                    (inbound=ALLOW_ALL, outbound=whitelist-only)
  3. Personal Whitelist            (per-account)
  4. Global/Corporate Whitelist    (org-wide domain patterns)
  5. Default Policy                (INBOUND=QUARANTINE+NOTIFY, OUTBOUND=BOUNCE)

All decisions are deterministic given the same PolicyContext.
No side effects — callers handle quarantine, bounce, notify, audit.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from .domain_matcher import (
    email_matches_pattern,
    email_domain,
    matches_any_pattern,
    normalize_email,
)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Direction(str, Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"


class Action(str, Enum):
    ALLOW = "ALLOW"
    QUARANTINE = "QUARANTINE"
    BOUNCE = "BOUNCE"


class ReasonCode(str, Enum):
    NORMAL_ALLOWED = "NORMAL_ALLOWED"
    GLOBAL_WHITELIST = "GLOBAL_WHITELIST"
    PERSONAL_WHITELIST = "PERSONAL_WHITELIST"
    CRO_INBOUND_ALLOWED = "CRO_INBOUND_ALLOWED"
    CRO_OUTBOUND_WHITELIST = "CRO_OUTBOUND_WHITELIST"
    CRO_OUTBOUND_NOT_WHITELISTED = "CRO_OUTBOUND_NOT_WHITELISTED"
    NOT_WHITELISTED = "NOT_WHITELISTED"
    PERSONAL_WHITELIST_MISS = "PERSONAL_WHITELIST_MISS"
    ATTACHMENT_PASSWORD_PROTECTED = "ATTACHMENT_PASSWORD_PROTECTED"
    ATTACHMENT_NOT_PASSWORD_PROTECTED = "ATTACHMENT_NOT_PASSWORD_PROTECTED"
    ATTACHMENT_INSPECTION_FAILED = "ATTACHMENT_INSPECTION_FAILED"
    POLICY_ERROR = "POLICY_ERROR"


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class AttachmentMeta:
    filename: str = ""
    mime_type: str = ""
    extension: str = ""
    size: int = 0
    password_protected: Optional[bool] = None  # None = inspection failed / unknown
    inspection_status: str = "unknown"  # ok | failed | unsupported


@dataclass
class PolicyContext:
    """Normalized email metadata passed to the policy engine."""
    message_id: str
    direction: Direction
    sender: str                       # normalized email
    recipients: list[str]             # normalized emails
    sender_domain: str                # extracted from sender
    recipient_domains: list[str]      # extracted from recipients
    subject: str = ""
    attachments: list[AttachmentMeta] = field(default_factory=list)
    # Account/branch metadata
    sender_is_internal: bool = False
    recipient_is_internal: list[bool] = field(default_factory=list)
    sender_is_cro: bool = False
    recipient_is_cro: list[bool] = field(default_factory=list)
    # Auth results (from Rspamd/milter headers if available)
    spf_pass: Optional[bool] = None
    dkim_pass: Optional[bool] = None
    dmarc_pass: Optional[bool] = None


@dataclass
class PolicyDecision:
    action: Action
    reason_code: ReasonCode
    notify_recipient: bool
    bounce_sender: bool
    matched_rule: str
    direction: Direction
    # Per-recipient decisions when multi-recipient support needed
    per_recipient: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "action": self.action.value,
            "reason_code": self.reason_code.value,
            "notify_recipient": self.notify_recipient,
            "bounce_sender": self.bounce_sender,
            "matched_rule": self.matched_rule,
            "direction": self.direction.value,
            "per_recipient": self.per_recipient,
        }


# ---------------------------------------------------------------------------
# Policy Engine Config
# ---------------------------------------------------------------------------

@dataclass
class PolicyEngineConfig:
    """
    Runtime configuration for the policy engine.
    Loaded from DB/config, passed to evaluate().
    All fields are lists of patterns (no hard-coded values here).
    """
    # Global whitelist: list of domain patterns e.g. "*.ccb.com", "*.go.id"
    global_whitelist_patterns: list[str] = field(default_factory=list)

    # Personal whitelist: {account_email: [allowed_email_or_domain, ...]}
    personal_whitelist: dict[str, list[str]] = field(default_factory=dict)

    # CRO account patterns (e.g. "*@branch.idn.ccb.com" or exact emails)
    cro_patterns: list[str] = field(default_factory=list)

    # Whether ALL outbound attachments must be password-protected
    require_attachment_password: bool = True

    # Fail-closed for uninspectable attachments (true = treat as unprotected)
    fail_closed_on_inspection_failure: bool = True

    # Policy priority order (configurable)
    priority_order: list[str] = field(default_factory=lambda: [
        "attachment_security",
        "cro",
        "personal_whitelist",
        "global_whitelist",
        "default",
    ])


# ---------------------------------------------------------------------------
# Policy Engine
# ---------------------------------------------------------------------------

class PolicyEngine:
    """
    Centralized, deterministic email policy evaluator.
    Each evaluate() call is pure — no DB calls, no side effects.
    """

    def __init__(self, config: PolicyEngineConfig):
        self.config = config

    def evaluate(self, ctx: PolicyContext) -> PolicyDecision:
        """
        Evaluate policy for an email context.
        Returns a deterministic PolicyDecision.
        Evaluation never silently falls back to ALLOW on error.
        """
        try:
            return self._evaluate_inner(ctx)
        except Exception as exc:
            # Fail-closed: any unexpected error → BOUNCE (not ALLOW)
            return PolicyDecision(
                action=Action.BOUNCE,
                reason_code=ReasonCode.POLICY_ERROR,
                notify_recipient=False,
                bounce_sender=True,
                matched_rule=f"policy_error:{exc}",
                direction=ctx.direction,
            )

    def _evaluate_inner(self, ctx: PolicyContext) -> PolicyDecision:
        # Execute rules in priority order
        for rule_name in self.config.priority_order:
            result = self._evaluate_rule(rule_name, ctx)
            if result is not None:
                return result

        # Should never reach here if "default" is last in priority_order
        # Fail-closed
        return PolicyDecision(
            action=Action.BOUNCE,
            reason_code=ReasonCode.POLICY_ERROR,
            notify_recipient=False,
            bounce_sender=True,
            matched_rule="no_default_rule_reached",
            direction=ctx.direction,
        )

    def _evaluate_rule(self, rule_name: str, ctx: PolicyContext) -> Optional[PolicyDecision]:
        if rule_name == "attachment_security":
            return self._eval_attachment_security(ctx)
        elif rule_name == "cro":
            return self._eval_cro(ctx)
        elif rule_name == "personal_whitelist":
            return self._eval_personal_whitelist(ctx)
        elif rule_name == "global_whitelist":
            return self._eval_global_whitelist(ctx)
        elif rule_name == "default":
            return self._eval_default(ctx)
        return None

    # ------------------------------------------------------------------
    # Rule 1: Outbound Attachment Security
    # ------------------------------------------------------------------

    def _eval_attachment_security(self, ctx: PolicyContext) -> Optional[PolicyDecision]:
        """
        MANDATORY for all outbound emails with attachments.
        Cannot be bypassed by whitelist status.
        """
        if ctx.direction != Direction.OUTBOUND:
            return None  # Only applies to outbound
        if not ctx.attachments:
            return None  # No attachments, skip
        if not self.config.require_attachment_password:
            return None  # Feature disabled

        for att in ctx.attachments:
            if att.password_protected is None:
                # Inspection failed
                if self.config.fail_closed_on_inspection_failure:
                    return PolicyDecision(
                        action=Action.BOUNCE,
                        reason_code=ReasonCode.ATTACHMENT_INSPECTION_FAILED,
                        notify_recipient=False,
                        bounce_sender=True,
                        matched_rule=f"attachment_inspection_failed:{att.filename}",
                        direction=ctx.direction,
                    )
                # else: treat as ok (fail-open, not recommended)
                continue

            if not att.password_protected:
                return PolicyDecision(
                    action=Action.BOUNCE,
                    reason_code=ReasonCode.ATTACHMENT_NOT_PASSWORD_PROTECTED,
                    notify_recipient=False,
                    bounce_sender=True,
                    matched_rule=f"attachment_not_protected:{att.filename}",
                    direction=ctx.direction,
                )

        # All attachments are password-protected — continue to other rules
        # (do NOT return ALLOW here; attachment security passes but other rules apply)
        return None

    # ------------------------------------------------------------------
    # Rule 2: CRO Policy
    # ------------------------------------------------------------------

    def _eval_cro(self, ctx: PolicyContext) -> Optional[PolicyDecision]:
        """
        CRO inbound: ALLOW ALL
        CRO outbound: whitelist only → check global + personal whitelist
        """
        if not ctx.sender_is_cro and not any(
            self._sender_matches_cro_pattern(ctx) for _ in [1]
        ):
            # Check if any recipient is CRO for inbound
            if ctx.direction == Direction.INBOUND:
                if not self._any_recipient_is_cro(ctx):
                    return None
            else:
                if not self._sender_is_cro(ctx):
                    return None

        if ctx.direction == Direction.INBOUND:
            # CRO inbound → ALLOW ALL
            if self._any_recipient_is_cro(ctx) or ctx.sender_is_cro:
                return PolicyDecision(
                    action=Action.ALLOW,
                    reason_code=ReasonCode.CRO_INBOUND_ALLOWED,
                    notify_recipient=False,
                    bounce_sender=False,
                    matched_rule="cro_inbound_allow_all",
                    direction=ctx.direction,
                )
        elif ctx.direction == Direction.OUTBOUND:
            if not self._sender_is_cro(ctx):
                return None
            # CRO outbound → whitelist only
            matched, pattern = self._sender_in_global_whitelist(ctx)
            if matched:
                return PolicyDecision(
                    action=Action.ALLOW,
                    reason_code=ReasonCode.CRO_OUTBOUND_WHITELIST,
                    notify_recipient=False,
                    bounce_sender=False,
                    matched_rule=f"cro_outbound_global_whitelist:{pattern}",
                    direction=ctx.direction,
                )
            # Check personal whitelist for CRO sender
            if self._any_recipient_in_personal_whitelist(ctx, ctx.sender):
                return PolicyDecision(
                    action=Action.ALLOW,
                    reason_code=ReasonCode.CRO_OUTBOUND_WHITELIST,
                    notify_recipient=False,
                    bounce_sender=False,
                    matched_rule="cro_outbound_personal_whitelist",
                    direction=ctx.direction,
                )
            # Not whitelisted → BOUNCE
            return PolicyDecision(
                action=Action.BOUNCE,
                reason_code=ReasonCode.CRO_OUTBOUND_NOT_WHITELISTED,
                notify_recipient=False,
                bounce_sender=True,
                matched_rule="cro_outbound_not_whitelisted",
                direction=ctx.direction,
            )
        return None

    # ------------------------------------------------------------------
    # Rule 3: Personal Whitelist
    # ------------------------------------------------------------------

    def _eval_personal_whitelist(self, ctx: PolicyContext) -> Optional[PolicyDecision]:
        """
        Account-scoped whitelist — NEVER leaks to other accounts.
        INBOUND: check sender against recipient's personal whitelist
        OUTBOUND: check recipient against sender's personal whitelist
        """
        if ctx.direction == Direction.INBOUND:
            # Check each recipient's personal whitelist
            for recipient in ctx.recipients:
                pw = self.config.personal_whitelist.get(normalize_email(recipient), [])
                if pw:
                    for pattern in pw:
                        if email_matches_pattern(ctx.sender, pattern):
                            return PolicyDecision(
                                action=Action.ALLOW,
                                reason_code=ReasonCode.PERSONAL_WHITELIST,
                                notify_recipient=False,
                                bounce_sender=False,
                                matched_rule=f"personal_whitelist:{recipient}:{pattern}",
                                direction=ctx.direction,
                            )
                    # Recipient has a personal whitelist but sender not in it
                    return PolicyDecision(
                        action=Action.QUARANTINE,
                        reason_code=ReasonCode.PERSONAL_WHITELIST_MISS,
                        notify_recipient=True,
                        bounce_sender=False,
                        matched_rule=f"personal_whitelist_miss:{recipient}",
                        direction=ctx.direction,
                    )
        elif ctx.direction == Direction.OUTBOUND:
            sender_pw = self.config.personal_whitelist.get(normalize_email(ctx.sender), [])
            if sender_pw:
                for recipient in ctx.recipients:
                    matched = any(email_matches_pattern(recipient, p) for p in sender_pw)
                    if not matched:
                        # At least one recipient not in personal whitelist
                        return PolicyDecision(
                            action=Action.BOUNCE,
                            reason_code=ReasonCode.PERSONAL_WHITELIST_MISS,
                            notify_recipient=False,
                            bounce_sender=True,
                            matched_rule=f"personal_whitelist_miss:{ctx.sender}:{recipient}",
                            direction=ctx.direction,
                        )
                # All recipients matched
                return PolicyDecision(
                    action=Action.ALLOW,
                    reason_code=ReasonCode.PERSONAL_WHITELIST,
                    notify_recipient=False,
                    bounce_sender=False,
                    matched_rule=f"personal_whitelist:{ctx.sender}",
                    direction=ctx.direction,
                )
        return None

    # ------------------------------------------------------------------
    # Rule 4: Global Whitelist
    # ------------------------------------------------------------------

    def _eval_global_whitelist(self, ctx: PolicyContext) -> Optional[PolicyDecision]:
        """
        Check sender domain (inbound) or recipient domains (outbound)
        against global whitelist patterns.
        """
        if ctx.direction == Direction.INBOUND:
            matched, pattern = matches_any_pattern(
                ctx.sender_domain, self.config.global_whitelist_patterns
            )
            if matched:
                return PolicyDecision(
                    action=Action.ALLOW,
                    reason_code=ReasonCode.GLOBAL_WHITELIST,
                    notify_recipient=False,
                    bounce_sender=False,
                    matched_rule=f"global_whitelist:{pattern}",
                    direction=ctx.direction,
                )
        elif ctx.direction == Direction.OUTBOUND:
            # All recipients must match for ALLOW; if any doesn't → fall through
            if ctx.recipient_domains:
                all_match = True
                first_pattern = None
                for rdomain in ctx.recipient_domains:
                    matched, pattern = matches_any_pattern(
                        rdomain, self.config.global_whitelist_patterns
                    )
                    if not matched:
                        all_match = False
                        break
                    if first_pattern is None:
                        first_pattern = pattern
                if all_match:
                    return PolicyDecision(
                        action=Action.ALLOW,
                        reason_code=ReasonCode.GLOBAL_WHITELIST,
                        notify_recipient=False,
                        bounce_sender=False,
                        matched_rule=f"global_whitelist:{first_pattern}",
                        direction=ctx.direction,
                    )
        return None

    # ------------------------------------------------------------------
    # Rule 5: Default Policy
    # ------------------------------------------------------------------

    def _eval_default(self, ctx: PolicyContext) -> PolicyDecision:
        """
        Default: inbound=QUARANTINE+NOTIFY, outbound=BOUNCE.
        This rule always returns (never returns None).
        """
        if ctx.direction == Direction.INBOUND:
            return PolicyDecision(
                action=Action.QUARANTINE,
                reason_code=ReasonCode.NOT_WHITELISTED,
                notify_recipient=True,
                bounce_sender=False,
                matched_rule="default_inbound_quarantine",
                direction=ctx.direction,
            )
        else:
            return PolicyDecision(
                action=Action.BOUNCE,
                reason_code=ReasonCode.NOT_WHITELISTED,
                notify_recipient=False,
                bounce_sender=True,
                matched_rule="default_outbound_bounce",
                direction=ctx.direction,
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _sender_is_cro(self, ctx: PolicyContext) -> bool:
        if ctx.sender_is_cro:
            return True
        return self._sender_matches_cro_pattern(ctx)

    def _sender_matches_cro_pattern(self, ctx: PolicyContext) -> bool:
        for pattern in self.config.cro_patterns:
            if email_matches_pattern(ctx.sender, pattern):
                return True
        return False

    def _any_recipient_is_cro(self, ctx: PolicyContext) -> bool:
        if any(ctx.recipient_is_cro):
            return True
        for recipient in ctx.recipients:
            for pattern in self.config.cro_patterns:
                if email_matches_pattern(recipient, pattern):
                    return True
        return False

    def _sender_in_global_whitelist(self, ctx: PolicyContext) -> tuple:
        """Check if any recipient domain is in global whitelist (for outbound)."""
        for rdomain in ctx.recipient_domains:
            matched, pattern = matches_any_pattern(
                rdomain, self.config.global_whitelist_patterns
            )
            if matched:
                return True, pattern
        return False, None

    def _any_recipient_in_personal_whitelist(self, ctx: PolicyContext, sender: str) -> bool:
        sender_pw = self.config.personal_whitelist.get(normalize_email(sender), [])
        if not sender_pw:
            return False
        for recipient in ctx.recipients:
            if any(email_matches_pattern(recipient, p) for p in sender_pw):
                return True
        return False


# ---------------------------------------------------------------------------
# Factory helper
# ---------------------------------------------------------------------------

def build_config_from_db(
    global_whitelist_patterns: list[str],
    personal_whitelist: dict[str, list[str]],
    cro_patterns: list[str],
    require_attachment_password: bool = True,
    fail_closed: bool = True,
) -> PolicyEngineConfig:
    """Build PolicyEngineConfig from DB-loaded data."""
    return PolicyEngineConfig(
        global_whitelist_patterns=global_whitelist_patterns,
        personal_whitelist=personal_whitelist,
        cro_patterns=cro_patterns,
        require_attachment_password=require_attachment_password,
        fail_closed_on_inspection_failure=fail_closed,
    )
