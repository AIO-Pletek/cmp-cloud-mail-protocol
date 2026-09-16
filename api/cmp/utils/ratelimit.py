"""Redis-backed login rate limiting and lockout (CWE-307 mitigation).

Counters are shared across all uvicorn workers via Redis.  Failures are
counted per client IP (hard lockout) and per account (soft throttle) so a
single source cannot brute-force credentials.  If Redis is unavailable the
limiter fails open (logs a warning) rather than locking users out.
"""

import logging
import os

from cmp.config import settings

logger = logging.getLogger("cmp.ratelimit")

# Lazy import: if the redis client is unavailable the limiter fails open
# instead of taking the whole API down at import time.
try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    aioredis = None

# Per-IP failures allowed inside the window before lockout
MAX_FAILURES_PER_IP = int(os.getenv("CMP_LOGIN_MAX_FAILURES_IP", "10"))
# Per-account failures allowed inside the window (higher: avoids account DoS)
MAX_FAILURES_PER_ACCOUNT = int(os.getenv("CMP_LOGIN_MAX_FAILURES_ACCOUNT", "25"))
# Sliding window / lockout duration in seconds
WINDOW_SECONDS = int(os.getenv("CMP_LOGIN_WINDOW_SECONDS", "900"))

_client = None  # module-level aioredis.Redis client (lazy)


def _redis():
    global _client
    if _client is None:
        if aioredis is None:
            raise RuntimeError("redis client library is not installed")
        _client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _client


def _keys(ip: str, email: str) -> tuple[str, str]:
    return f"rl:login:ip:{ip}", f"rl:login:acct:{(email or '').strip().lower()}"


async def check_login_allowed(ip: str, email: str) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    try:
        r = _redis()
        ip_key, acct_key = _keys(ip, email)
        for key, limit in ((ip_key, MAX_FAILURES_PER_IP), (acct_key, MAX_FAILURES_PER_ACCOUNT)):
            raw = await r.get(key)
            if raw is not None and int(raw) >= limit:
                ttl = await r.ttl(key)
                return False, max(int(ttl), 1)
    except Exception as exc:  # fail open, never lock everyone out on a Redis blip
        logger.warning("rate-limit check unavailable, allowing request: %s", exc)
    return True, 0


async def record_login_failure(ip: str, email: str) -> None:
    try:
        r = _redis()
        ip_key, acct_key = _keys(ip, email)
        for key in (ip_key, acct_key):
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, WINDOW_SECONDS)
            await pipe.execute()
    except Exception as exc:
        logger.warning("rate-limit record failed: %s", exc)


async def reset_login_failures(ip: str, email: str) -> None:
    try:
        r = _redis()
        ip_key, acct_key = _keys(ip, email)
        await r.delete(ip_key, acct_key)
    except Exception as exc:
        logger.warning("rate-limit reset failed: %s", exc)
