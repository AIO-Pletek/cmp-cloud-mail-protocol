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
import sys
import signal

# Add CMP API to path
sys.path.insert(0, "/opt/cmp/api")

from cmp.policy.policy_engine import (
    PolicyEngine, PolicyContext, AttachmentMeta, Direction,
    Action, build_config_from_db
)
from cmp.policy.policy_store import load_policy_config, write_audit_log
from cmp.policy.domain_matcher import email_domain, normalize_email

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


async def load_engine() -> PolicyEngine:
    """Load policy engine config from DB."""
    cfg_data = await load_policy_config(TENANT_ID)
    config = build_config_from_db(**cfg_data)
    return PolicyEngine(config)


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
    # Simple heuristic: if SASL username present = OUTBOUND
    sasl_user = req.get("sasl_username", "")
    direction = Direction.OUTBOUND if sasl_user else Direction.INBOUND

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
            engine = await load_engine()
            ctx = build_policy_context(req)
            decision = engine.evaluate(ctx)

            # Async audit log (fire-and-forget)
            asyncio.ensure_future(write_audit_log(
                tenant_id=TENANT_ID,
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
