#!/usr/bin/env python3
import asyncio
import asyncpg

async def check():
    with open("/opt/cmp/.env") as f:
        for line in f:
            if line.startswith("DB_PASSWORD=***                db_pass = line.split("=", 1)[1].strip()
                break
    
    conn = await asyncpg.connect(f"postgresql://cmp:***@127.0.0.1:5432/cmp")
    
    exists = await conn.fetchval("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_logs')")
    print(f"Table exists: {exists}")
    
    if exists:
        count = await conn.fetchval("SELECT COUNT(*) FROM email_logs")
        print(f"Rows: {count}")
        
        try:
            await conn.execute(
                "INSERT INTO email_logs (queue_id, timestamp, direction, sender, recipient, size_bytes, status, status_message, source_ip, destination_relay, domain, action) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
                "TEST001", "2026-08-06", "outgoing", "test@test.com", "recv@recv.com", 100, "sent", "OK", "1.2.3.4", "5.6.7.8", "test.com", "delivered"
            )
            print("Test insert: OK")
        except Exception as e:
            print(f"Insert error: {e}")
    
    await conn.close()

asyncio.run(check())
