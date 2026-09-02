#!/usr/bin/env python3
import asyncio
import sys
sys.path.insert(0, '/opt/cmp/api')
from cmp.services.email_log_service import parse_and_store_logs

async def main():
    count = await parse_and_store_logs()
    if count > 0:
        print(f'Synced {count} new email entries')
    else:
        print('No new entries')

asyncio.run(main())
