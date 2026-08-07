#!/usr/bin/env python3
import asyncio
import asyncpg

async def fix():
    with open('/opt/cmp/.env') as f:
        for line in f:
            k, _, v = line.partition('=')
            if k.strip() == 'DB_PASSWORD':
                pw = v.strip()
                break
    conn = await asyncpg.connect(host='127.0.0.1', port=5432, user='cmp', password=pw, database='cmp')
    await conn.execute('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false')
    await conn.execute("UPDATE tenants SET is_admin = true WHERE email = 'admin@cbncloud.net'")
    rows = await conn.fetch('SELECT email, is_admin FROM tenants')
    for r in rows:
        print(f"{r['email']}: admin={r['is_admin']}")
    await conn.close()

asyncio.run(fix())
