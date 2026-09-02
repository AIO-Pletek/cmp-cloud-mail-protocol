"""
Test suite for Email Security Policy Engine.
Covers all 20 test cases from the requirements.

Run: python3 -m pytest tests/test_policy_engine.py -v
"""
from typing import Optional
import pytest
from cmp.policy.policy_engine import (
    PolicyEngine, PolicyEngineConfig, PolicyContext, AttachmentMeta,
    Direction, Action, ReasonCode, build_config_from_db
)
from cmp.policy.domain_matcher import matches_domain_pattern, email_matches_pattern


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

# Global whitelist patterns per requirements
GLOBAL_WL = [
    "*.go.id", "*.co.id", "*.or.id",
    "*.asia.ccb.com", "*.bankccb.com", "*.ccb.com",
    "*.ccb.com.sg", "*.my.ccb.com", "*.ccbf.com",
]

# Personal whitelist: abc@idn.ccb.com allows xyz@gmail.com
PERSONAL_WL = {
    "abc@idn.ccb.com": ["xyz@gmail.com"],
}

# CRO accounts
CRO_PATTERNS = ["cro@idn.ccb.com", "*@cro.idn.ccb.com"]


def make_engine(
    global_wl=None, personal_wl=None, cro_patterns=None,
    require_attachment_password=True, fail_closed=True
) -> PolicyEngine:
    cfg = build_config_from_db(
        global_whitelist_patterns=global_wl if global_wl is not None else GLOBAL_WL,
        personal_whitelist=personal_wl if personal_wl is not None else PERSONAL_WL,
        cro_patterns=cro_patterns if cro_patterns is not None else CRO_PATTERNS,
        require_attachment_password=require_attachment_password,
        fail_closed=fail_closed,
    )
    return PolicyEngine(cfg)


def ctx(direction, sender, recipients, attachments=None, sender_is_cro=False):
    from cmp.policy.domain_matcher import email_domain, normalize_email
    return PolicyContext(
        message_id="test",
        direction=Direction(direction),
        sender=normalize_email(sender),
        recipients=[normalize_email(r) for r in (recipients if isinstance(recipients, list) else [recipients])],
        sender_domain=email_domain(sender),
        recipient_domains=[email_domain(r) for r in (recipients if isinstance(recipients, list) else [recipients])],
        attachments=attachments or [],
        sender_is_cro=sender_is_cro,
    )


def att(filename="file.pdf", protected: Optional[bool] = True, inspection_status="ok"):
    return AttachmentMeta(
        filename=filename,
        mime_type="application/octet-stream",
        extension=filename.rsplit(".", 1)[-1] if "." in filename else "",
        password_protected=protected,
        inspection_status=inspection_status,
    )


# ===========================================================================
# Domain Matcher Tests
# ===========================================================================

class TestDomainMatcher:
    def test_wildcard_subdomain_matches(self):
        assert matches_domain_pattern("mail.ccb.com", "*.ccb.com")

    def test_wildcard_does_not_match_evil_domain(self):
        """evil-ccb.com must NOT match *.ccb.com — security boundary test."""
        assert not matches_domain_pattern("evil-ccb.com", "*.ccb.com")

    def test_wildcard_does_not_match_bare_parent(self):
        """*.ccb.com should NOT match ccb.com itself (no subdomain)."""
        assert not matches_domain_pattern("ccb.com", "*.ccb.com")

    def test_exact_match(self):
        assert matches_domain_pattern("ccb.com", "ccb.com")

    def test_exact_no_partial_match(self):
        assert not matches_domain_pattern("notccb.com", "ccb.com")

    def test_multi_level_subdomain(self):
        """mail.asia.ccb.com should match *.asia.ccb.com."""
        assert matches_domain_pattern("mail.asia.ccb.com", "*.asia.ccb.com")

    def test_go_id_matching(self):
        assert matches_domain_pattern("kemenkeu.go.id", "*.go.id")
        assert matches_domain_pattern("bpk.go.id", "*.go.id")
        assert not matches_domain_pattern("evil-go.id", "*.go.id")

    def test_co_id_matching(self):
        assert matches_domain_pattern("tokopedia.co.id", "*.co.id")
        assert not matches_domain_pattern("evil-co.id", "*.co.id")

    def test_or_id_matching(self):
        assert matches_domain_pattern("yayasan.or.id", "*.or.id")

    def test_case_insensitive(self):
        assert matches_domain_pattern("MAIL.CCB.COM", "*.ccb.com")

    def test_bankccb_matching(self):
        assert matches_domain_pattern("smtp.bankccb.com", "*.bankccb.com")
        assert not matches_domain_pattern("evil-bankccb.com", "*.bankccb.com")


# ===========================================================================
# Policy Engine Tests — Global Whitelist
# ===========================================================================

class TestGlobalWhitelist:
    def test_inbound_whitelisted_sender_allow(self):
        """Case 1 & 3: inbound whitelisted sender → ALLOW."""
        engine = make_engine()
        d = engine.evaluate(ctx("INBOUND", "user@bpk.go.id", "internal@idn.ccb.com"))
        assert d.action == Action.ALLOW
        assert d.reason_code == ReasonCode.GLOBAL_WHITELIST

    def test_inbound_ccb_subdomain_allow(self):
        engine = make_engine()
        d = engine.evaluate(ctx("INBOUND", "partner@mail.ccb.com", "user@idn.ccb.com"))
        assert d.action == Action.ALLOW
        assert d.reason_code == ReasonCode.GLOBAL_WHITELIST

    def test_outbound_whitelisted_recipient_allow(self):
        """Case 2 & 4: outbound whitelisted recipient → ALLOW.
        Use smtp.bankccb.com (subdomain) to match *.bankccb.com.
        Use noone@idn.ccb.com (no personal WL) as sender.
        """
        engine = make_engine()
        d = engine.evaluate(ctx("OUTBOUND", "noone@idn.ccb.com", "partner@smtp.bankccb.com"))
        assert d.action == Action.ALLOW
        assert d.reason_code == ReasonCode.GLOBAL_WHITELIST

    def test_evil_domain_not_allowed(self):
        """Case 18: evil-ccb.com must NOT match *.ccb.com."""
        engine = make_engine()
        d = engine.evaluate(ctx("INBOUND", "attacker@evil-ccb.com", "user@idn.ccb.com"))
        # Should NOT be ALLOW via global whitelist
        assert d.action != Action.ALLOW or d.reason_code != ReasonCode.GLOBAL_WHITELIST
        # With no personal whitelist for this recipient, default = QUARANTINE
        assert d.action == Action.QUARANTINE

    def test_co_id_inbound_allow(self):
        engine = make_engine()
        d = engine.evaluate(ctx("INBOUND", "info@mandiri.co.id", "user@idn.ccb.com"))
        assert d.action == Action.ALLOW
        assert d.reason_code == ReasonCode.GLOBAL_WHITELIST


# ===========================================================================
# Policy Engine Tests — Default Policy (non-whitelisted)
# ===========================================================================

class TestDefaultPolicy:
    def test_inbound_non_whitelisted_quarantine_notify(self):
        """Case 5: inbound non-whitelisted → QUARANTINE + notify_recipient."""
        engine = make_engine(personal_wl={})  # No personal WL
        d = engine.evaluate(ctx("INBOUND", "stranger@gmail.com", "user@idn.ccb.com"))
        assert d.action == Action.QUARANTINE
        assert d.notify_recipient is True
        assert d.reason_code == ReasonCode.NOT_WHITELISTED

    def test_outbound_non_whitelisted_bounce(self):
        """Case 6: outbound non-whitelisted → BOUNCE."""
        engine = make_engine(personal_wl={})
        d = engine.evaluate(ctx("OUTBOUND", "user@idn.ccb.com", "outsider@yahoo.com"))
        assert d.action == Action.BOUNCE
        assert d.bounce_sender is True
        assert d.reason_code == ReasonCode.NOT_WHITELISTED


# ===========================================================================
# Policy Engine Tests — Personal Whitelist
# ===========================================================================

class TestPersonalWhitelist:
    def test_personal_whitelist_inbound_match_allow(self):
        """Case 7: personal whitelist inbound match → ALLOW."""
        engine = make_engine()
        d = engine.evaluate(ctx("INBOUND", "xyz@gmail.com", "abc@idn.ccb.com"))
        assert d.action == Action.ALLOW
        assert d.reason_code == ReasonCode.PERSONAL_WHITELIST

    def test_personal_whitelist_inbound_miss_quarantine(self):
        """Case 9: personal whitelist inbound miss → QUARANTINE + NOTIFY."""
        engine = make_engine()
        d = engine.evaluate(ctx("INBOUND", "other@gmail.com", "abc@idn.ccb.com"))
        assert d.action == Action.QUARANTINE
        assert d.notify_recipient is True
        assert d.reason_code == ReasonCode.PERSONAL_WHITELIST_MISS

    def test_personal_whitelist_outbound_match_allow(self):
        """Case 8: personal whitelist outbound match → ALLOW."""
        engine = make_engine()
        d = engine.evaluate(ctx("OUTBOUND", "abc@idn.ccb.com", "xyz@gmail.com"))
        assert d.action == Action.ALLOW
        assert d.reason_code == ReasonCode.PERSONAL_WHITELIST

    def test_personal_whitelist_outbound_miss_bounce(self):
        """Case 10: personal whitelist outbound miss → BOUNCE."""
        engine = make_engine()
        d = engine.evaluate(ctx("OUTBOUND", "abc@idn.ccb.com", "other@gmail.com"))
        assert d.action == Action.BOUNCE
        assert d.bounce_sender is True
        assert d.reason_code == ReasonCode.PERSONAL_WHITELIST_MISS

    def test_personal_whitelist_does_not_leak_to_other_accounts(self):
        """Personal WL of user A must NOT apply to user B."""
        engine = make_engine()
        # def@idn.ccb.com has no personal whitelist
        # xyz@gmail.com is allowed for abc@idn.ccb.com but NOT def@idn.ccb.com
        d = engine.evaluate(ctx("INBOUND", "xyz@gmail.com", "def@idn.ccb.com"))
        # def has no PW, so falls through to global WL check then default
        assert d.action == Action.QUARANTINE
        assert d.reason_code == ReasonCode.NOT_WHITELISTED

    def test_personal_whitelist_is_account_scoped(self):
        """Extra: user A and B have different personal WLs — no cross-contamination."""
        pw = {
            "a@company.com": ["friend@external.com"],
            "b@company.com": ["colleague@another.com"],
        }
        engine = make_engine(global_wl=[], personal_wl=pw, cro_patterns=[])

        # a@company receives from friend@external → ALLOW
        d1 = engine.evaluate(ctx("INBOUND", "friend@external.com", "a@company.com"))
        assert d1.action == Action.ALLOW

        # b@company receives from friend@external → NOT in b's PW → QUARANTINE
        d2 = engine.evaluate(ctx("INBOUND", "friend@external.com", "b@company.com"))
        assert d2.action == Action.QUARANTINE
        assert d2.reason_code == ReasonCode.PERSONAL_WHITELIST_MISS


# ===========================================================================
# Policy Engine Tests — CRO Policy
# ===========================================================================

class TestCROPolicy:
    def test_cro_inbound_allow_all(self):
        """Case 11: CRO inbound → ALLOW (any sender)."""
        engine = make_engine()
        d = engine.evaluate(ctx("INBOUND", "stranger@gmail.com", "cro@idn.ccb.com"))
        assert d.action == Action.ALLOW
        assert d.reason_code == ReasonCode.CRO_INBOUND_ALLOWED

    def test_cro_outbound_to_whitelisted_allow(self):
        """Case 12: CRO outbound to whitelisted recipient → ALLOW.
        smtp.bankccb.com matches *.bankccb.com pattern.
        """
        engine = make_engine()
        d = engine.evaluate(ctx("OUTBOUND", "cro@idn.ccb.com", "partner@smtp.bankccb.com"))
        assert d.action == Action.ALLOW
        assert d.reason_code == ReasonCode.CRO_OUTBOUND_WHITELIST

    def test_cro_outbound_to_non_whitelisted_bounce(self):
        """Case 13: CRO outbound to non-whitelisted recipient → BOUNCE."""
        engine = make_engine()
        d = engine.evaluate(ctx("OUTBOUND", "cro@idn.ccb.com", "outsider@yahoo.com"))
        assert d.action == Action.BOUNCE
        assert d.reason_code == ReasonCode.CRO_OUTBOUND_NOT_WHITELISTED


# ===========================================================================
# Policy Engine Tests — Attachment Security
# ===========================================================================

class TestAttachmentSecurity:
    def test_outbound_password_protected_attachment_passes(self):
        """Case 14: outbound password-protected → ALLOW (subject to other rules).
        Use noone@idn.ccb.com (no personal WL) + smtp.bankccb.com (matches *.bankccb.com).
        """
        engine = make_engine()
        attachments = [att("report.pdf", protected=True)]
        # sending to whitelisted recipient + protected attachment = ALLOW
        d = engine.evaluate(ctx("OUTBOUND", "noone@idn.ccb.com", "partner@smtp.bankccb.com", attachments=attachments))
        assert d.action == Action.ALLOW

    def test_outbound_unprotected_attachment_bounce(self):
        """Case 15: outbound unprotected attachment → BOUNCE."""
        engine = make_engine()
        attachments = [att("report.xlsx", protected=False)]
        d = engine.evaluate(ctx("OUTBOUND", "user@idn.ccb.com", "partner@bankccb.com", attachments=attachments))
        assert d.action == Action.BOUNCE
        assert d.reason_code == ReasonCode.ATTACHMENT_NOT_PASSWORD_PROTECTED

    def test_multiple_attachments_one_unprotected_bounce(self):
        """Case 16: multiple attachments, one unprotected → BOUNCE."""
        engine = make_engine()
        attachments = [
            att("doc.pdf", protected=True),
            att("data.xlsx", protected=False),
        ]
        d = engine.evaluate(ctx("OUTBOUND", "user@idn.ccb.com", "partner@bankccb.com", attachments=attachments))
        assert d.action == Action.BOUNCE
        assert d.reason_code == ReasonCode.ATTACHMENT_NOT_PASSWORD_PROTECTED

    def test_whitelisted_recipient_plus_unprotected_attachment_bounce(self):
        """Case 17: whitelisted recipient + unprotected attachment → BOUNCE (attachment security not bypassed)."""
        engine = make_engine()
        attachments = [att("confidential.xlsx", protected=False)]
        # partner@ccb.com is globally whitelisted BUT attachment not protected
        d = engine.evaluate(ctx("OUTBOUND", "user@idn.ccb.com", "partner@ccb.com", attachments=attachments))
        assert d.action == Action.BOUNCE
        assert d.reason_code == ReasonCode.ATTACHMENT_NOT_PASSWORD_PROTECTED

    def test_inspection_failure_fail_closed(self):
        """Fail-closed: uninspectable attachment → BOUNCE."""
        engine = make_engine(fail_closed=True)
        attachments = [att("mystery.rar", protected=None, inspection_status="failed")]
        d = engine.evaluate(ctx("OUTBOUND", "user@idn.ccb.com", "partner@bankccb.com", attachments=attachments))
        assert d.action == Action.BOUNCE
        assert d.reason_code == ReasonCode.ATTACHMENT_INSPECTION_FAILED

    def test_inbound_attachment_not_checked(self):
        """Attachment security only applies to OUTBOUND.
        smtp.bankccb.com matches *.bankccb.com → ALLOW regardless of attachment.
        """
        engine = make_engine()
        attachments = [att("data.xlsx", protected=False)]
        d = engine.evaluate(ctx("INBOUND", "partner@smtp.bankccb.com", "user@idn.ccb.com", attachments=attachments))
        # inbound from whitelisted sender → ALLOW regardless of attachment
        assert d.action == Action.ALLOW


# ===========================================================================
# Policy Engine Tests — Fail-safe behavior
# ===========================================================================

class TestFailSafe:
    def test_policy_never_silently_falls_back_to_allow(self):
        """Policy failure must not silently ALLOW mail."""
        # Remove 'default' from priority order to simulate missing default rule
        cfg = PolicyEngineConfig(
            global_whitelist_patterns=[],
            personal_whitelist={},
            cro_patterns=[],
            priority_order=["attachment_security"],  # No default!
        )
        engine = PolicyEngine(cfg)
        d = engine.evaluate(ctx("INBOUND", "attacker@evil.com", "user@company.com"))
        # Should BOUNCE (fail-closed), not ALLOW
        assert d.action != Action.ALLOW

    def test_exception_in_evaluation_bounces_not_allows(self):
        """Any exception during evaluation → BOUNCE, not ALLOW."""
        class CorruptedEngine(PolicyEngine):
            def _evaluate_inner(self, ctx):
                raise RuntimeError("unexpected db error")

        cfg = build_config_from_db([], {}, [])
        engine = CorruptedEngine(cfg)
        d = engine.evaluate(ctx("INBOUND", "any@external.com", "user@internal.com"))
        assert d.action == Action.BOUNCE
        assert d.reason_code == ReasonCode.POLICY_ERROR
