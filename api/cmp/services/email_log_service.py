"""Email transaction logging service."""
import asyncio
import re
import os
from datetime import datetime, timedelta


def get_db_password():
    with open("/opt/cmp/.env") as f:
        for line in f:
            key, _, value = line.partition("=")
            if key.strip() == "DB_PASSWORD":
                return value.strip()
    return os.environ.get("DB_PASSWORD", "")


async def get_db():
    import asyncpg
    password = get_db_password()
    return await asyncpg.connect(f"postgresql://cmp:{password}@127.0.0.1:5432/cmp")


async def init_email_logs_table():
    conn = await get_db()
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS email_logs (
            id SERIAL PRIMARY KEY,
            queue_id VARCHAR(20),
            timestamp TIMESTAMPTZ DEFAULT NOW(),
            direction VARCHAR(10) DEFAULT 'incoming',
            sender VARCHAR(255),
            recipient VARCHAR(255),
            size_bytes BIGINT DEFAULT 0,
            status VARCHAR(50),
            status_message TEXT,
            source_ip VARCHAR(45),
            destination_relay VARCHAR(255),
            domain VARCHAR(255),
            action VARCHAR(50) DEFAULT 'delivered',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_email_logs_ts ON email_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_email_logs_domain ON email_logs(domain);
        CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
    """)
    await conn.close()


async def parse_and_store_logs():
    conn = await get_db()
    last = await conn.fetchval("SELECT MAX(timestamp) FROM email_logs")
    if last is None:
        last = datetime.utcnow() - timedelta(hours=72)

    log_file = "/var/log/mail.log"
    if not os.path.exists(log_file):
        await conn.close()
        return 0

    # First pass: collect sender info and client IPs by queue_id
    senders = {}
    clients = {}
    sizes = {}
    with open(log_file) as f:
        for line in f:
            from_match = re.search(r"(\w+): from=<([^>]*)>, size=(\d+)", line)
            if from_match:
                qid = from_match.group(1)
                senders[qid] = from_match.group(2)
                sizes[qid] = int(from_match.group(3))
            client_match = re.search(r"(\w+): client=(\d+\.\d+\.\d+\.\d+)", line)
            if client_match:
                qid = client_match.group(1)
                clients[qid] = client_match.group(2)

    # Second pass: match delivery status with sender
    entries = []
    with open(log_file) as f:
        for line in f:
            ts_match = re.match(r"^(\w{3}\s+\d+\s+\d+:\d+:\d+)", line)
            if not ts_match:
                continue
            try:
                ts = datetime.strptime(f"2026 {ts_match.group(1)}", "%Y %b %d %H:%M:%S")
            except ValueError:
                continue
            if ts <= last:
                continue

            m = re.search(r"(\w+): to=<([^>]+)>, relay=([^,]+), .+status=(\w+) \((.+?)\)", line)
            if m:
                qid, recip, relay, status, msg = m.groups()
                sender = senders.get(qid, "")
                src_ip = clients.get(qid, "")
                size = sizes.get(qid, 0)
                domain = recip.split("@")[-1] if "@" in recip else ""
                direction = "incoming" if src_ip and src_ip not in ["127.0.0.1", "::1"] else "outgoing"
                entries.append((qid, ts, direction, sender, recip, size, status, msg[:500], src_ip, relay, domain, "delivered" if status == "sent" else status))

    count = 0
    for e in entries:
        try:
            await conn.execute(
                "INSERT INTO email_logs (queue_id,timestamp,direction,sender,recipient,size_bytes,status,status_message,source_ip,destination_relay,domain,action) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
                *e
            )
            count += 1
        except Exception:
            pass
    await conn.close()
    return count


async def get_email_logs(domain=None, direction=None, status=None, sender=None, recipient=None, page=1, per_page=50):
    conn = await get_db()
    conditions = []
    params = []
    idx = 1
    for field, val in [("domain", domain), ("direction", direction), ("status", status)]:
        if val:
            conditions.append(f"{field} = ${idx}")
            params.append(val)
            idx += 1
    if sender:
        conditions.append(f"sender ILIKE ${idx}")
        params.append(f"%{sender}%")
        idx += 1
    if recipient:
        conditions.append(f"recipient ILIKE ${idx}")
        params.append(f"%{recipient}%")
        idx += 1
    where = " AND ".join(conditions) if conditions else "1=1"
    total = await conn.fetchval(f"SELECT COUNT(*) FROM email_logs WHERE {where}", *params)
    offset = (page - 1) * per_page
    limit_idx = idx
    offset_idx = idx + 1
    query = "SELECT * FROM email_logs WHERE " + where + " ORDER BY timestamp DESC LIMIT $" + str(limit_idx) + " OFFSET $" + str(offset_idx)
    rows = await conn.fetch(query, *params, per_page, offset)
    await conn.close()
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "per_page": per_page, "pages": (total + per_page - 1) // per_page}


async def get_email_stats(days=7):
    conn = await get_db()
    w = f"timestamp >= NOW() - INTERVAL '{days} days'"
    total = await conn.fetchval(f"SELECT COUNT(*) FROM email_logs WHERE {w}")
    incoming = await conn.fetchval(f"SELECT COUNT(*) FROM email_logs WHERE {w} AND direction='incoming'")
    outgoing = await conn.fetchval(f"SELECT COUNT(*) FROM email_logs WHERE {w} AND direction='outgoing'")
    delivered = await conn.fetchval(f"SELECT COUNT(*) FROM email_logs WHERE {w} AND status='sent'")
    bounced = await conn.fetchval(f"SELECT COUNT(*) FROM email_logs WHERE {w} AND status='bounced'")
    rejected = await conn.fetchval(f"SELECT COUNT(*) FROM email_logs WHERE {w} AND status='rejected'")
    by_domain = await conn.fetch(f"SELECT domain, COUNT(*) as count, direction FROM email_logs WHERE {w} AND domain != '' GROUP BY domain, direction ORDER BY count DESC LIMIT 20")
    hourly = await conn.fetch(f"SELECT date_trunc('hour', timestamp) as hour, COUNT(*) as count, direction FROM email_logs WHERE {w} GROUP BY hour, direction ORDER BY hour DESC LIMIT 48")
    by_status = await conn.fetch(f"SELECT status, COUNT(*) as count FROM email_logs WHERE {w} GROUP BY status ORDER BY count DESC")
    await conn.close()
    return {"period_days": days, "total": total, "incoming": incoming, "outgoing": outgoing, "delivered": delivered, "bounced": bounced, "rejected": rejected, "by_domain": [dict(r) for r in by_domain], "by_hour": [dict(r) for r in hourly], "by_status": [dict(r) for r in by_status]}
