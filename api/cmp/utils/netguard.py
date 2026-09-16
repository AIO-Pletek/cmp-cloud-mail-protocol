"""Network egress guard for user-supplied webhook URLs (SSRF defense).

Webhook URLs are attacker-controllable, so every fetch target must be a
public http/https endpoint.  This module rejects loopback, RFC1918,
link-local, CGNAT, reserved and cloud-metadata addresses, both at
registration time and again immediately before each delivery.
"""

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

# Hostnames that must never be fetched, regardless of DNS
BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
    "metadata",
    "metadata.google.internal",
    "instance-data",
}

# Cloud metadata endpoints (also covered by the range checks, kept explicit)
METADATA_IPS = {
    "169.254.169.254",   # AWS / Azure / OpenStack
    "169.254.170.2",     # AWS ECS task metadata
    "fd00:ec2::254",     # AWS IMDSv6
    "100.100.100.200",   # Alibaba Cloud
    "192.0.0.192",       # Oracle Cloud
}

_ALLOWED_SCHEMES = {"http", "https"}


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.is_site_local:
        return False
    if isinstance(ip, ipaddress.IPv4Address):
        for cidr in ("100.64.0.0/10", "192.0.0.0/24", "198.18.0.0/15", "240.0.0.0/4"):
            if ip in ipaddress.ip_network(cidr):
                return False
    return True


async def _resolve(host: str, port: int | None) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.run_in_executor(
        None,
        lambda: socket.getaddrinfo(host, port or 0, type=socket.SOCK_STREAM),
    )
    return sorted({str(info[4][0]) for info in infos})


async def validate_webhook_url(url: str) -> list[str]:
    """Validate a webhook target; return the resolved public IPs.

    Raises ValueError with a human-readable reason when the target is not a
    public http/https endpoint.
    """
    parts = urlsplit(url)
    if parts.scheme.lower() not in _ALLOWED_SCHEMES:
        raise ValueError("Webhook URL must use http or https")
    host = parts.hostname
    if not host:
        raise ValueError("Webhook URL must include a host")
    if parts.username or parts.password:
        raise ValueError("Webhook URL must not contain embedded credentials")
    if host.lower() in BLOCKED_HOSTNAMES:
        raise ValueError("Webhook host is not allowed")

    # Literal IP address in the URL
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None

    if literal is not None:
        if not _is_public_ip(literal) or str(literal) in METADATA_IPS:
            raise ValueError("Webhook host resolves to a non-public address")
        return [str(literal)]

    try:
        ips = await _resolve(host, parts.port)
    except socket.gaierror as exc:
        raise ValueError(f"Webhook host could not be resolved: {exc}") from exc
    if not ips:
        raise ValueError("Webhook host could not be resolved")

    for addr in ips:
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError as exc:
            raise ValueError("Webhook host resolved to an invalid address") from exc
        if not _is_public_ip(ip) or addr in METADATA_IPS:
            raise ValueError("Webhook host resolves to a non-public address")
    return ips
