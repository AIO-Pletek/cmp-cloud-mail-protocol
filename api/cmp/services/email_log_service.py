import asyncio
import re
import os
import asyncpg
from datetime import datetime, timedelta

DB_HOST = "127.0.0.1"
DB_PORT = 5432
DB_USER = "cmp"
DB_NAME = "cmp"

def get_db_password():
    with open("/opt/cmp/.env") as f:
        for line in f:
            key, _, value = line.partition("=")
            if key.strip() == "DB_PASSWORD": return value.strip()
    return ""

async def get_db():
    return await asyncpg.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=get_db_password(), database=DB_NAME)

async def init_email_logs_table():
    conn = await get_db()
    await conn.execute("""CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY, queue_id VARCHAR(20), timestamp TIMESTAMPTZ DEFAULT NOW(),
        direction VARCHAR(10) DEFAULT 'incoming', sender VARCHAR(255), recipient VARCHAR(255),
        size_bytes INTEGER DEFAULT 0, status VARCHAR(20), status_message TEXT,
        source_ip VARCHAR(45), destination_relay VARCHAR(255), spam_score FLOAT DEFAULT 0,
        action VARCHAR(20) DEFAULT 'deliver', domain VARCHAR(255));
        CREATE INDEX IF NOT EXISTS idx_el_ts ON email_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_el_domain ON email_logs(domain);""")
    await conn.close()

async def get_email_logs(domain=None, direction=None, status=None, sender=None, recipient=None, page=1, per_page=50, tenant_domains=None):
    conn = await get_db()
    conditions, params, idx = [], [], 1
    if tenant_domains:
        dc = []
        for d in tenant_domains:
            dc.append("domain = $" + str(idx)); params.append(d); idx += 1
        conditions.append("(" + " OR ".join(dc) + ")")
    if domain: conditions.append("domain = $" + str(idx)); params.append(domain); idx += 1
    if direction: conditions.append("direction = $" + str(idx)); params.append(direction); idx += 1
    if status: conditions.append("status = $" + str(idx)); params.append(status); idx += 1
    if sender: conditions.append("sender ILIKE $" + str(idx)); params.append("%" + sender + "%"); idx += 1
    if recipient: conditions.append("recipient ILIKE $" + str(idx)); params.append("%" + recipient + "%"); idx += 1
    where = " AND ".join(conditions) if conditions else "1=1"
    total = await conn.fetchval(f"SELECT COUNT(*) FROM email_logs WHERE {where}", *params)
    offset = (page - 1) * per_page
    rows = await conn.fetch(f"SELECT * FROM email_logs WHERE {where} ORDER BY timestamp DESC LIMIT $" + str(idx) + " OFFSET $" + str(idx + 1), *params, per_page, offset)
    await conn.close()
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "per_page": per_page, "pages": max(1, (total + per_page - 1) // per_page)}

async def get_email_stats(days=7, tenant_domains=None):
    conn = await get_db()
    params, idx = [], 1
    conditions = [f"timestamp > NOW() - INTERVAL '{days} days'"]
    if tenant_domains:
        dc = []
        for d in tenant_domains:
            dc.append("domain = $" + str(idx)); params.append(d); idx += 1
        conditions.append("(" + " OR ".join(dc) + ")")
    q = " AND ".join(conditions)
    def qn(col): return conn.fetchval(f"SELECT {col} FROM email_logs WHERE {q}", *params)
    total = await qn("COUNT(*)")
    incoming = await qn("COUNT(*) FILTER (WHERE direction='incoming')")
    outgoing = await qn("COUNT(*) FILTER (WHERE direction='outgoing')")
    delivered = await qn("COUNT(*) FILTER (WHERE status='sent')")
    bounced = await qn("COUNT(*) FILTER (WHERE status='bounced')")
    rejected = await qn("COUNT(*) FILTER (WHERE status='rejected')")
    bd = await conn.fetch(f"SELECT domain, COUNT(*) as count, direction FROM email_logs WHERE {q} AND domain IS NOT NULL AND domain != '' GROUP BY domain, direction ORDER BY count DESC LIMIT 20", *params)
    hr = await conn.fetch(f"SELECT date_trunc('hour', timestamp) as hour, COUNT(*) as count, direction FROM email_logs WHERE {q} GROUP BY hour, direction ORDER BY hour DESC LIMIT 48", *params)
    st = await conn.fetch(f"SELECT status, COUNT(*) as count FROM email_logs WHERE {q} GROUP BY status ORDER BY count DESC", *params)
    await conn.close()
    return {"period_days": days, "total": total or 0, "incoming": incoming or 0, "outgoing": outgoing or 0, "delivered": delivered or 0, "bounced": bounced or 0, "rejected": rejected or 0, "by_domain": [dict(r) for r in bd], "by_hour": [dict(r) for r in hr], "by_status": [dict(r) for r in st]}


async def _get_relay_domains(conn) -> set:
    """Fetch all active domain names from the DB to classify inbound vs outbound."""
    rows = await conn.fetch("SELECT domain_name FROM domains WHERE is_active = TRUE")
    return {r["domain_name"].strip().lower() for r in rows}


async def parse_and_store_logs(since=None):
    conn = await get_db()
    if since is not None:
        last = since.replace(tzinfo=None)
    else:
        last = await conn.fetchval("SELECT MAX(timestamp) FROM email_logs")
        last = last.replace(tzinfo=None) if last else datetime.utcnow() - timedelta(hours=72)

    # Load owned relay domains once for the whole parse run
    relay_domains = await _get_relay_domains(conn)

    # FIX bug #2 (logrotate): build list of log files to parse.
    # Always read mail.log.1 first (rotated file) when it exists and contains
    # entries newer than the last DB timestamp, so no data is lost after logrotate.
    log_files = []
    rotated = "/var/log/mail.log.1"
    current = "/var/log/mail.log"
    if os.path.exists(rotated):
        # Peek at last line of rotated file to check if it has unprocessed entries
        try:
            with open(rotated) as rf:
                last_line = ""
                for last_line in rf:
                    pass
            ts_m = re.match(r"^(\w{3}\s+\d+\s+\d+:\d+:\d+)", last_line)
            if ts_m:
                last_rotated_ts = datetime.strptime(ts_m.group(1), "%b %d %H:%M:%S").replace(year=datetime.now().year)
                if last_rotated_ts > last:
                    log_files.append(rotated)
        except Exception:
            pass
    if os.path.exists(current):
        log_files.append(current)

    if not log_files:
        await conn.close()
        return 0

    count, queue_ids = 0, {}
    for log_file in log_files:
        with open(log_file) as f:
            for line in f:
                ts_m = re.match(r"^(\w{3}\s+\d+\s+\d+:\d+:\d+)", line)
                if not ts_m: continue
                try: ts = datetime.strptime(ts_m.group(1), "%b %d %H:%M:%S").replace(year=datetime.now().year)
                except: continue
                if ts <= last: continue
                # FIX: match mixed-case queue IDs (Postfix uses alphanumeric, not only uppercase hex)
                qid_m = re.search(r"([A-Za-z0-9]{10,}):", line)
                if not qid_m: continue
                qid = qid_m.group(1)
                if "from=" in line:
                    fm = re.search(r"from=<([^>]*)>", line)
                    sm = re.search(r"size=(\d+)", line)
                    sender_addr = fm.group(1) if fm else ""
                    queue_ids[qid] = {"sender": sender_addr, "size": int(sm.group(1)) if sm else 0}
                if "to=" in line and "status=" not in line and ("milter-reject" in line or ": reject:" in line):
                    tm2 = re.search(r"to=<([^>]+)>", line)
                    fm2 = re.search(r"from=<([^>]*)>", line)
                    rsn = re.search(r"\]:\s*[\d.]+\s+(.+?);?\s*from=<", line)
                    if tm2:
                        recip = tm2.group(1)
                        sender = fm2.group(1) if fm2 else queue_ids.get(qid, {}).get("sender", "")
                        dom = recip.split("@")[-1].lower() if "@" in recip else ""
                        sender_dom = sender.split("@")[-1].lower() if "@" in sender else ""
                        direction = "incoming" if (dom in relay_domains or not sender) else ("outgoing" if sender_dom in relay_domains else "incoming")
                        msg = rsn.group(1) if rsn else "rejected"
                        await conn.execute(
                            """INSERT INTO email_logs
                               (queue_id, timestamp, direction, sender, recipient,
                                size_bytes, status, status_message, destination_relay, domain, action)
                               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'rejected')
                               ON CONFLICT (queue_id, recipient) DO NOTHING""",
                            qid, ts, direction, sender, recip, 0, "rejected", msg, "", dom
                        )
                        count += 1
                elif "to=" in line and "status=" in line:
                    tm = re.search(r"to=<([^>]+)>", line)
                    st_m = re.search(r"status=(\w+)", line)
                    rm = re.search(r"relay=([^,\[]+)", line)
                    msg_m = re.search(r"status=\w+ \((.+?)\)", line)
                    if tm and st_m:
                        recip = tm.group(1)
                        sender = queue_ids.get(qid, {}).get("sender", "")
                        sz = queue_ids.get(qid, {}).get("size", 0)
                        st, relay, msg = st_m.group(1), rm.group(1).strip() if rm else "", msg_m.group(1) if msg_m else ""
                        dom = recip.split("@")[-1].lower() if "@" in recip else ""
                        sender_dom = sender.split("@")[-1].lower() if "@" in sender else ""

                        # FIX: domain-table based direction detection
                        # Recipient domain in our relay_domains -> email arriving for our user = inbound
                        # Sender domain in our relay_domains -> email sent by our user = outgoing
                        # Empty envelope sender (from=<>) -> bounce/DSN -> incoming
                        # Fallback: status-based heuristic
                        if dom in relay_domains:
                            direction = "incoming"
                        elif sender_dom in relay_domains:
                            direction = "outgoing"
                        elif not sender:
                            direction = "incoming"
                        else:
                            direction = "outgoing" if st in ("sent", "bounced", "rejected") else "incoming"

                        # FIX bug #1 (duplikat): ON CONFLICT DO NOTHING prevents duplicate inserts
                        await conn.execute(
                            """INSERT INTO email_logs
                               (queue_id, timestamp, direction, sender, recipient,
                                size_bytes, status, status_message, destination_relay, domain)
                               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                               ON CONFLICT (queue_id, recipient) DO NOTHING""",
                            qid, ts, direction, sender, recip, sz, st, msg, relay, dom
                        )
                        count += 1
    await conn.close()
    return count
