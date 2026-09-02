#!/usr/bin/env python3
"""Sync attachment-password domain map for rspamd. Run manually or via cron."""
import asyncio
import sys

sys.path.insert(0, "/opt/cmp/api")

from cmp.services.attachment_password_map import sync_attachment_password_map

if __name__ == "__main__":
    print(asyncio.run(sync_attachment_password_map()))
