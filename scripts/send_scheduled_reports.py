#!/usr/bin/env python3
"""
Cron script: generate and send scheduled weekly reports.
Run every Monday at 8 AM via crontab.
"""
import asyncio
import json
import os
import sys

# Add the CMP API to path so we can import services
sys.path.insert(0, "/opt/cmp/api")

from cmp.services.scheduled_report_service import (
    load_config,
    generate_and_send_report,
)


async def main():
    reports = load_config()
    if not reports:
        print("No scheduled reports configured.")
        return

    for report in reports:
        if not report.get("enabled", True):
            print(f"Skipping disabled report #{report.get('id')}: {report.get('email')}")
            continue

        print(f"Sending report #{report.get('id')} to {report.get('email')} for domains: {report.get('domains')}")
        result = await generate_and_send_report(report)
        if result.get("success"):
            print(f"  ✓ Sent {result['reports_sent']} report(s)")
        else:
            print(f"  ✗ Error: {result.get('error')}")


if __name__ == "__main__":
    asyncio.run(main())
