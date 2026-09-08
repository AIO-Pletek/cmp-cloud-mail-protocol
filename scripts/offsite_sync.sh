#!/bin/bash
# Offsite backup sync: CMP -> stats.cbncloud.net (103.24.13.19)
rsync -az --delete -e 'ssh -i /root/.ssh/cmp_backup_ed25519 -o BatchMode=yes' /var/backups/cmp/ root@103.24.13.19:/var/backups/cmp-offsite/ >> /var/log/cmp/offsite_sync.log 2>&1
