#!/usr/bin/env python3
"""Fix destination_relay in database."""
import asyncio
import asyncpg

async def fix():
    # Read DB password from .env
    db_pass = ""
    with open("/opt/cmp/.env") as f:
        for line in f:
            if line.startswith("DB_PASSWORD=***                db_pass = line.split("=", 1)[1].strip()
                break
    
    conn = await asyncpg.connect(f"postgresql://cmp:***@127.0.0.1:5432/cmp")
    
    # Add column
    await conn.execute("ALTER TABLE domains ADD COLUMN IF NOT EXISTS destination_relay VARCHAR(255)")
    
    # Set destination for plesk.rodahitam.my.id
    await conn.execute("UPDATE domains SET destination_relay = '116.204.131.86' WHERE domain_name = 'plesk.rodahitam.my.id'")
    
    # Verify
    rows = await conn.fetch("SELECT domain_name, destination_relay FROM domains WHERE is_active = true")
    for row in rows:
        print(f"{row['domain_name']} -> {row['destination_relay']}")
    
    await conn.close()

asyncio.run(fix())
