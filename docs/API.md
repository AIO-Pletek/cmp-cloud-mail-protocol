# CMP API Reference

## Overview

The CMP API is a FastAPI-based REST API running on port 8000. It provides programmatic access to all platform management functions.

**Base URL:** `https://mail.cmp.local/api`

**Authentication:** Bearer token (JWT)

```
Authorization: Bearer <token>
```

## Authentication

### POST /api/auth/login

Obtain a JWT access token.

**Request:**
```json
{
    "email": "admin@example.com",
    "password": "your_password"
}
```

**Response (200):**
```json
{
    "access_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
        "id": 1,
        "email": "admin@example.com",
        "role": "admin"
    }
}
```

### POST /api/auth/refresh

Refresh an expiring token.

**Headers:** `Authorization: Bearer <current_token>`

**Response (200):**
```json
{
    "access_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 3600
}
```

### POST /api/auth/logout

Invalidate current token.

---

## Domains

### GET /api/domains

List all managed domains.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number (default: 1) |
| `limit` | int | Items per page (default: 20) |
| `search` | string | Search domain names |
| `active` | bool | Filter by active status |

**Response (200):**
```json
{
    "domains": [
        {
            "id": 1,
            "domain_name": "example.com",
            "is_active": true,
            "dkim_configured": true,
            "spf_valid": true,
            "dmarc_configured": true,
            "mailbox_count": 42,
            "created_at": "2025-01-15T10:30:00Z"
        }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
}
```

### POST /api/domains

Add a new domain.

**Request:**
```json
{
    "domain_name": "newdomain.com",
    "generate_dkim": true
}
```

**Response (201):**
```json
{
    "id": 2,
    "domain_name": "newdomain.com",
    "verification_code": "abc123def456",
    "dns_records": {
        "mx": { "name": "newdomain.com", "value": "mail.cmp.local", "priority": 10 },
        "spf": { "name": "newdomain.com", "value": "v=spf1 mx a ip4:... -all" },
        "dkim": { "name": "cmp._domainkey.newdomain.com", "value": "v=DKIM1; k=rsa; p=..." },
        "dmarc": { "name": "_dmarc.newdomain.com", "value": "v=DMARC1; p=quarantine; ..." }
    }
}
```

### GET /api/domains/{id}

Get domain details.

### PUT /api/domains/{id}

Update domain settings.

### DELETE /api/domains/{id}

Deactivate a domain (soft delete).

### POST /api/domains/{id}/verify

Trigger domain ownership verification.

---

## Mailboxes

### GET /api/mailboxes

List mailboxes across all domains.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `domain_id` | int | Filter by domain |
| `page` | int | Page number |
| `limit` | int | Items per page |
| `search` | string | Search email addresses |
| `active` | bool | Filter by status |

### POST /api/mailboxes

Create a new mailbox.

**Request:**
```json
{
    "email": "user@example.com",
    "password": "secure_password",
    "quota_mb": 1024,
    "is_active": true
}
```

### GET /api/mailboxes/{id}

Get mailbox details including usage stats.

### PUT /api/mailboxes/{id}

Update mailbox (password, quota, status).

### DELETE /api/mailboxes/{id}

Deactivate a mailbox.

### POST /api/mailboxes/{id}/reset-password

Reset mailbox password.

**Request:**
```json
{
    "new_password": "new_secure_password"
}
```

---

## Quarantine

### GET /api/quarantine

List quarantined messages.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `domain_id` | int | Filter by domain |
| `mailbox_id` | int | Filter by mailbox |
| `reason` | string | `spam`, `virus`, `policy` |
| `from_date` | string | ISO 8601 start |
| `to_date` | string | ISO 8601 end |
| `page` | int | Page number |
| `limit` | int | Items per page |

**Response (200):**
```json
{
    "messages": [
        {
            "id": 1234,
            "from": "spammer@evil.com",
            "to": "user@example.com",
            "subject": "Buy now!",
            "reason": "spam",
            "score": 14.2,
            "received_at": "2025-01-15T14:22:00Z",
            "quarantined_at": "2025-01-15T14:22:01Z",
            "size_bytes": 45321,
            "attachments": 1,
            "headers": { ... }
        }
    ],
    "total": 150,
    "page": 1,
    "limit": 20
}
```

### POST /api/quarantine/{id}/release

Release a quarantined message to the recipient's inbox.

### DELETE /api/quarantine/{id}

Permanently delete a quarantined message.

### POST /api/quarantine/bulk-release

Release multiple messages.

**Request:**
```json
{
    "ids": [1234, 1235, 1236]
}
```

### POST /api/quarantine/bulk-delete

Delete multiple messages.

---

## Reports & Analytics

### GET /api/reports/mail-flow

Mail flow statistics.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `period` | string | `1h`, `24h`, `7d`, `30d` |
| `domain_id` | int | Filter by domain |

**Response (200):**
```json
{
    "period": "24h",
    "inbound": { "total": 1500, "delivered": 1400, "rejected": 50, "quarantined": 50 },
    "outbound": { "total": 800, "sent": 790, "failed": 10 },
    "spam": { "total": 300, "blocked": 280, "greylisted": 20 },
    "virus": { "total": 5, "blocked": 5 },
    "timeline": [
        { "timestamp": "2025-01-15T00:00:00Z", "inbound": 62, "outbound": 33, "spam": 12 }
    ]
}
```

### GET /api/reports/top-senders

Top sending domains/IPs.

### GET /api/reports/top-recipients

Most active recipients.

### GET /api/reports/spam-stats

Spam filtering statistics.

### GET /api/reports/delivery-failures

Recent delivery failures with bounce reasons.

---

## System

### GET /api/system/health

System health check.

**Response (200):**
```json
{
    "status": "healthy",
    "version": "1.0.0",
    "uptime_seconds": 864000,
    "services": {
        "database": "ok",
        "redis": "ok",
        "postfix": "ok",
        "dovecot": "ok",
        "rspamd": "ok",
        "clamav": "ok"
    },
    "disk": { "total_gb": 100, "used_gb": 35, "percent": 35 },
    "memory": { "total_mb": 8192, "used_mb": 4096, "percent": 50 }
}
```

### GET /api/system/config

Get current system configuration (sanitized - no secrets).

### PUT /api/system/config

Update system configuration.

### POST /api/system/backup

Trigger an immediate backup.

### GET /api/system/logs

Retrieve recent application logs.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `service` | string | `api`, `worker`, `postfix`, etc. |
| `level` | string | `info`, `warning`, `error` |
| `lines` | int | Number of lines (default: 100) |

---

## Users (Admin)

### GET /api/users

List admin/portal users.

### POST /api/users

Create a new user.

### PUT /api/users/{id}

Update user.

### DELETE /api/users/{id}

Deactivate user.

---

## Error Responses

All error responses follow this format:

```json
{
    "detail": "Human-readable error message",
    "code": "ERROR_CODE",
    "status": 400
}
```

### Common Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `VALIDATION_ERROR` | Request validation failed |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource already exists |
| 422 | `UNPROCESSABLE` | Business logic error |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 requests | per minute |
| `/api/*` (general) | 30 requests | per second |
| `/api/quarantine/bulk-*` | 10 requests | per minute |

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1705312800
```
