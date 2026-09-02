#!/usr/bin/env python3
"""
CMP Email Security Policy Daemon for Postfix.
Listens on TCP port 10031 (or Unix socket).
Implements Postfix policy service protocol (RFC-style key=value).

Postfix sends:
  request=smtpd_access_policy
  protocol_state=RCPT
  sender=user@external.com
  recipient=user@internal.com
  ...
  [blank line]

We respond with:
  action=DUNNO        (pass to next restriction)
  action=REJECT msg   (reject with message)
  action=HOLD msg     (hold for manual review)
  [blank line]

Postfix config:
  smtpd_recipient_restrictions = ... check_policy_service inet:127.0.0.1:10031
"""
import asyncio
import json
import logging
import os
import asyncpg
import sys
import signal

# Add CMP API to path
sys.path.insert(0, "/opt/cmp/api")

from cmp.policy.policy_engine import (
    PolicyEngine, PolicyContext, AttachmentMeta, Direction,
    Action, build_config_from_db
)
from cmp.policy.policy_store import load_policy_config, write_audit_log
from cmp.policy.domain_policy_store import load_domain_policy, list_active_tenant_domains, get_domain_approval_required_by_name
from cmp.policy.domain_policy_engine import evaluate_domain_policy, DomainPolicyAction
from cmp.policy.domain_matcher import email_domain, normalize_email, email_matches_pattern
from cmp.services.domain_approval_service import create_and_notify

def _get_pg_password() -> str:
    try:
        with open('/opt/cmp/.env') as f:
            for line in f:
                k, _, v = line.partition('=')
                if k.strip() == 'DB_PASSWORD':
                    return v.strip()
    except OSError:
        pass
    return os.environ.get('DB_PASSWORD', '')


async def _asyncpg_conn():
    return await asyncpg.connect(
        host='127.0.0.1', port=5432, user='cmp',
        password=_get_pg_password(), database='cmp'
    )


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [PolicyDaemon] %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler("/var/log/cmp/policy_daemon.log"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

HOST = "127.0.0.1"
PORT = 10031
POLICY_VERSION = "1.0"
TENANT_ID = os.environ.get("CMP_TENANT_ID", "0201fa69-1857-430c-b78a-0df2ca5d10de")  # default admin tenant


async def load_engine(tenant_id: str = TENANT_ID) -> PolicyEngine:
    """Load legacy policy engine config from DB for the resolved tenant."""
    cfg_data = await load_policy_config(tenant_id)
    config = build_config_from_db(**cfg_data)
    return PolicyEngine(config)


async def resolve_tenant_id(req: dict, direction: Direction) -> tuple[str | None, set[str]]:
    """Resolve tenant from the owned recipient (inbound) or sender (outbound)."""
    rows = await list_active_tenant_domains()
    owned = {str(row["domain_name"]).strip().lower() for row in rows}
    target = email_domain(req.get("recipient", "")) if direction == Direction.INBOUND else email_domain(req.get("sender", ""))
    for row in rows:
        if str(row["domain_name"]).strip().lower() == target:
            return str(row["tenant_id"]), owned
    # Some relay clients authenticate as an email-style username.
    if direction == Direction.OUTBOUND:
        auth_domain = email_domain(req.get("sasl_username", ""))
        for row in rows:
            if str(row["domain_name"]).strip().lower() == auth_domain:
                return str(row["tenant_id"]), owned
    return None, owned


async def _load_cro_patterns(tenant_id: str) -> list[str]:
    """Load CRO account patterns for the tenant from policy_cro_accounts."""
    conn = await _asyncpg_conn()
    try:
        rows = await conn.fetch(
            "SELECT account_pattern FROM policy_cro_accounts WHERE tenant_id=$1 AND enabled=TRUE",
            tenant_id
        )
        return [r["account_pattern"] for r in rows]
    finally:
        await conn.close()


def _email_matches_any_cro(email: str, patterns: list[str]) -> bool:
    for pat in patterns:
        if email_matches_pattern(email, pat):
            return True
    return False


async def evaluate_domain_stage(req: dict, ctx: PolicyContext) -> tuple[object | None, str | None]:
    """Evaluate the new tenant/global domain policy before legacy rules.

    CRO accounts bypass the allowlist restriction: if the sender (inbound) or
    any recipient (outbound) matches a tenant CRO pattern, domain policy is
    skipped entirely and the message proceeds to the legacy policy engine where
    the CRO rule fires. Explicit BLOCK rules still win over CRO bypass because
    blocks are checked before the CRO short-circuit.
    """
    tenant_id, owned_domains = await resolve_tenant_id(req, ctx.direction)
    if not tenant_id:
        return None, None
    if ctx.direction == Direction.INBOUND:
        # Inbound: check sender domain against owned domains to identify external
        candidates = [ctx.sender_domain]
        external = [d for d in candidates if d and d not in owned_domains]
        if not external:
            return None, tenant_id  # sender is internal, skip policy
    else:
        # Outbound: check recipient domains against policy.
        # Skip owned/internal domains — policy only applies to external recipients.
        external = [d for d in ctx.recipient_domains if d and d not in owned_domains]
        if not external:
            return None, tenant_id  # all recipients are internal, skip

    policy = await load_domain_policy(tenant_id)

    # 1. Explicit block rules always win — check these before CRO bypass.
    for domain in external:
        from cmp.policy.domain_matcher import matches_any_pattern
        _, blk = matches_any_pattern(domain, policy.get("global_domain_block_patterns", []))
        if blk:
            decision = evaluate_domain_policy(domain, policy)
            return decision, tenant_id
        _, tblk = matches_any_pattern(domain, policy.get("tenant_domain_block_patterns", []))
        if tblk:
            decision = evaluate_domain_policy(domain, policy)
            return decision, tenant_id

    # 2. CRO bypass: if sender/recipients match CRO patterns, skip allowlist check.
    cro_patterns = await _load_cro_patterns(tenant_id)
    if cro_patterns:
        if ctx.direction == Direction.INBOUND:
            if _email_matches_any_cro(ctx.sender, cro_patterns):
                log.info(f"DOMAIN_POLICY CRO bypass inbound sender {ctx.sender}")
                return None, tenant_id  # let legacy engine handle CRO_INBOUND_ALLOWED
        else:
            for rcpt in ctx.recipients:
                if _email_matches_any_cro(rcpt, cro_patterns):
                    log.info(f"DOMAIN_POLICY CRO bypass outbound recipient {rcpt}")
                    return None, tenant_id

    # 3. Full domain policy evaluation (allowlist, global allows, etc.)
    # Also check per-domain approval_required flag (Fix 3)
    for domain in external:
        decision = evaluate_domain_policy(domain, policy)
        if decision.action == DomainPolicyAction.REJECT:
            from cmp.policy.domain_policy_engine import DomainPolicyReason
            if decision.reason_code in (
                DomainPolicyReason.TENANT_ALLOWLIST_MISS,
            ):
                # HOLD for approval instead of hard REJECT
                return ("HOLD_FOR_APPROVAL", decision, tenant_id), tenant_id
            return decision, tenant_id

    # Per-domain approval_required: if the recipient domain has approval_required=True,
    # hold the message UNLESS the sender domain is already in the tenant allow list.
    if ctx.direction == Direction.INBOUND:
        recipient_domain = ctx.recipient_domains[0] if ctx.recipient_domains else None
        if recipient_domain and recipient_domain in owned_domains:
            approval_required = await get_domain_approval_required_by_name(recipient_domain)
            if approval_required:
                # Skip approval if sender domain is explicitly allowed in tenant policy
                from cmp.policy.domain_matcher import matches_any_pattern
                allow_patterns = policy.get("tenant_domain_allow_patterns", [])
                sender_allowed, _ = matches_any_pattern(ctx.sender_domain, allow_patterns)
                if sender_allowed:
                    log.info(f"DOMAIN_POLICY per-domain approval_required bypassed: {ctx.sender_domain} is in tenant allow list")
                else:
                    log.info(f"DOMAIN_POLICY per-domain approval_required=True for {recipient_domain}, holding message")
                    return ("HOLD_FOR_APPROVAL", None, tenant_id), tenant_id

    return "ALLOW", tenant_id


def parse_postfix_request(data: str) -> dict:
    """Parse Postfix policy request into dict."""
    result = {}
    for line in data.strip().splitlines():
        line = line.strip()
        if "=" in line:
            key, _, val = line.partition("=")
            result[key.strip()] = val.strip()
    return result


def build_policy_context(req: dict) -> PolicyContext:
    """Build PolicyContext from Postfix request attributes."""
    sender = normalize_email(req.get("sender", ""))
    recipient = normalize_email(req.get("recipient", ""))
    if not sender:
        sender = "unknown@unknown"
    if not recipient:
        recipient = "unknown@unknown"

    # Determine direction based on recipient domain
    # Internal domains loaded from config; fallback: check if recipient matches known internal patterns
    # For now: INBOUND = sender is external (not in our domains)
    # The engine will figure out the right policy based on whitelist config
    # Detect direction:
    # 1. SASL username present = outbound relay via port 587
    # 2. client_address is in mynetworks (Plesk/trusted relay) + sender is local domain = outbound
    sasl_user = req.get("sasl_username", "")
    client_addr = req.get("client_address", "")
    MYNETWORKS = {"127.0.0.1", "::1", "116.204.131.86"}  # keep in sync with main.cf mynetworks
    sender_domain_local = email_domain(sender) if sender != "unknown@unknown" else ""
    if sasl_user:
        direction = Direction.OUTBOUND
    elif client_addr in MYNETWORKS and sender_domain_local:
        # Trusted relay (Plesk webmail etc.) — treat as outbound, check recipient domain
        direction = Direction.OUTBOUND
    else:
        direction = Direction.INBOUND

    return PolicyContext(
        message_id=req.get("queue_id", req.get("instance", "unknown")),
        direction=direction,
        sender=sender,
        recipients=[recipient],
        sender_domain=email_domain(sender),
        recipient_domains=[email_domain(recipient)],
        subject="",  # Not available at SMTP time
        attachments=[],  # Not available at SMTP time — attachment check happens at content_filter
    )


def decision_to_postfix_action(decision, req: dict) -> str:
    """Convert policy decision to Postfix action string."""
    if decision.action == Action.ALLOW:
        return "DUNNO"
    elif decision.action == Action.QUARANTINE:
        reason = decision.reason_code.value.replace("_", " ").title()
        return f"HOLD Message quarantined: {reason}"
    elif decision.action == Action.BOUNCE:
        reason = decision.reason_code.value.replace("_", " ").title()
        return f"REJECT Email not permitted: {reason}"
    else:
        # Fail-closed
        return "REJECT Policy evaluation failed"


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    try:
        raw = await reader.read(4096)
        if not raw:
            return

        data = raw.decode("utf-8", errors="replace")
        req = parse_postfix_request(data)

        if not req or req.get("request") not in ("smtpd_access_policy", None):
            writer.write(b"action=DUNNO\n\n")
            await writer.drain()
            return

        protocol_state = req.get("protocol_state", "RCPT")
        # Only evaluate at RCPT TO stage
        if protocol_state not in ("RCPT", "DATA", "END-OF-MESSAGE"):
            writer.write(b"action=DUNNO\n\n")
            await writer.drain()
            return

        try:
            ctx = build_policy_context(req)
            domain_stage_result, resolved_tenant_id = await evaluate_domain_stage(req, ctx)
            decision = None
            if isinstance(domain_stage_result, tuple) and len(domain_stage_result) == 3 and domain_stage_result[0] == "HOLD_FOR_APPROVAL":
                _, domain_decision, _tid = domain_stage_result
                queue_id = req.get("queue_id", req.get("instance", ""))
                sender_domain = domain_decision.domain if domain_decision is not None else (ctx.sender.split("@")[1] if "@" in ctx.sender else "unknown")
                action = f"HOLD Domain approval required: email from {sender_domain} is pending review"
                log.info(f"DOMAIN_POLICY {ctx.direction.value} {ctx.sender}->{ctx.recipients} => HOLD_FOR_APPROVAL ({sender_domain})")
                asyncio.ensure_future(create_and_notify(
                    tenant_id=resolved_tenant_id or TENANT_ID,
                    queue_id=queue_id,
                    sender=ctx.sender,
                    recipient=ctx.recipients[0] if ctx.recipients else "",
                    sender_domain=sender_domain,
                    subject="",
                    direction=ctx.direction.value,
                ))
            elif domain_stage_result == "ALLOW":
                action = "DUNNO"
                log.info(f"DOMAIN_POLICY {ctx.direction.value} {ctx.sender}->{ctx.recipients} => ALLOW")
            elif domain_stage_result is not None:
                action = f"REJECT 5.7.1 Email domain policy: {domain_stage_result.reason_code.value}"
                log.info(f"DOMAIN_POLICY {ctx.direction.value} {ctx.sender}->{ctx.recipients} => REJECT ({domain_stage_result.matched_rule})")
            else:
                # domain_stage_result is None = domain policy skipped
                # (internal recipients, no tenant resolved, or CRO bypass).
                # For OUTBOUND, skip legacy engine — outbound is domain-policy only.
                # For INBOUND, fall through to legacy engine (whitelist/CRO rules).
                if ctx.direction == Direction.OUTBOUND:
                    action = "DUNNO"
                    log.info(f"DOMAIN_POLICY OUTBOUND {ctx.sender}->{ctx.recipients} => DUNNO (internal/skip)")
                else:
                    engine = await load_engine(resolved_tenant_id or TENANT_ID)
                    decision = engine.evaluate(ctx)

            if decision is not None:
                asyncio.ensure_future(write_audit_log(
                    tenant_id=resolved_tenant_id or TENANT_ID,
                    message_id=ctx.message_id,
                    direction=ctx.direction.value,
                    sender=ctx.sender,
                    recipients=ctx.recipients,
                    action=decision.action.value,
                    reason_code=decision.reason_code.value,
                    matched_rule=decision.matched_rule,
                    notify_recipient=decision.notify_recipient,
                    bounce_sender=decision.bounce_sender,
                    policy_version=POLICY_VERSION,
                ))
                action = decision_to_postfix_action(decision, req)
                log.info(f"{ctx.direction.value} {ctx.sender}->{ctx.recipients} => {decision.action.value} ({decision.reason_code.value})")

        except Exception as e:
            log.error(f"Policy evaluation error: {e}")
            action = "DUNNO"  # Fail-open on error to avoid blocking all mail

        response = f"action={action}\n\n"
        writer.write(response.encode())
        await writer.drain()

    except Exception as e:
        log.error(f"Handler error for {peer}: {e}")
        try:
            writer.write(b"action=DUNNO\n\n")
            await writer.drain()
        except Exception:
            pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def main():
    server = await asyncio.start_server(handle_client, HOST, PORT)
    log.info(f"CMP Policy Daemon listening on {HOST}:{PORT}")
    log.info(f"Tenant ID: {TENANT_ID}")

    def shutdown(sig):
        log.info(f"Received signal {sig}, shutting down")
        server.close()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda s=sig: shutdown(s))

    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
