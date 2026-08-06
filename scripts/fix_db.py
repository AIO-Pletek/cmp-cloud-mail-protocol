#!/usr/bin/env python3
"""Fix destination_relay in database."""
import asyncio
import asyncpg

async def fix():
    with open("/tmp/.dbpass") as f:
        db_pass = f.read().strip()
    
    conn = await asyncpg.connect(f"postgresql://cmp:{db_pass}@127.0.0.1:5432/cmp")
    
    await conn.execute("ALTER TABLE domains ADD COLUMN IF NOT EXISTS destination_relay VARCHAR(255)")
    await conn.execute("UPDATE domains SET destination_relay = '116.204.131.86' WHERE domain_name = 'plesk.rodahitam.my.id'")
    
    rows = await conn.fetch("SELECT domain_name, destination_relay FROM domains WHERE is_active = true")
    for row in rows:
        print(f"{row['domain_name']} -> {row['destination_relay']}")
    
    await conn.close()

asyncio.run(fix())
