"""
Secure domain boundary matching for the Email Security Policy Engine.

Rules:
  - Matching is case-insensitive (normalize to lowercase).
  - Wildcard patterns like *.ccb.com match subdomain.ccb.com but NOT evil-ccb.com.
  - A pattern without wildcard matches exact domain only.
  - Do NOT use substring matching (str.endswith) without boundary check.

Usage:
    matches_domain_pattern("mail.ccb.com", "*.ccb.com")  # True
    matches_domain_pattern("evil-ccb.com", "*.ccb.com")  # False
    matches_domain_pattern("ccb.com", "*.ccb.com")        # False (no subdomain)
    matches_domain_pattern("ccb.com", "ccb.com")           # True
"""
import re


def normalize_domain(domain: str) -> str:
    """Lowercase + strip whitespace."""
    return domain.strip().lower()


def normalize_email(email: str) -> str:
    """Lowercase + strip whitespace."""
    return email.strip().lower()


def email_domain(email: str) -> str:
    """Extract domain from email address."""
    email = normalize_email(email)
    if "@" in email:
        return email.split("@", 1)[1]
    return email


def matches_domain_pattern(domain: str, pattern: str) -> bool:
    """
    Match a domain against a single pattern.

    Patterns:
      - "*.ccb.com"  → matches any single-level subdomain of ccb.com
      - "ccb.com"    → exact match only
      - "*.go.id"    → any subdomain of go.id

    Security: does NOT match evil-ccb.com against *.ccb.com because
    evil-ccb.com's parent is NOT ccb.com.
    """
    domain = normalize_domain(domain)
    pattern = normalize_domain(pattern)

    if pattern.startswith("*."):
        # Wildcard: *.ccb.com → must match <something>.ccb.com
        parent = pattern[2:]  # "ccb.com"
        # domain must end with "."+parent (boundary check)
        suffix = "." + parent
        if domain.endswith(suffix):
            # Ensure there is exactly one subdomain level (not bare parent)
            prefix = domain[: -len(suffix)]
            # prefix must be non-empty and contain no dots
            # (single subdomain level — mail.ccb.com OK, a.b.ccb.com also OK per spec)
            # spec says "subdomains" broadly, so multi-level ok
            return bool(prefix) and not prefix.startswith(".")
        return False
    else:
        return domain == pattern


def matches_any_pattern(domain: str, patterns: list) -> tuple:
    """
    Check if domain matches any pattern in the list.
    Returns (matched: bool, matched_pattern: str | None)
    """
    for pattern in patterns:
        if matches_domain_pattern(domain, pattern):
            return True, pattern
    return False, None


def email_matches_pattern(email: str, pattern: str) -> bool:
    """
    Match an email address against a pattern.
    Pattern can be:
      - exact email: xyz@gmail.com
      - domain wildcard: *.gmail.com
      - bare domain: gmail.com (matches any @gmail.com)
    """
    email = normalize_email(email)
    pattern = normalize_email(pattern)

    if "@" in pattern:
        # Exact email match
        return email == pattern
    elif pattern.startswith("*."):
        # Domain wildcard
        domain = email_domain(email)
        return matches_domain_pattern(domain, pattern)
    else:
        # Bare domain — match any @domain
        return email_domain(email) == pattern
