#!/bin/sh
# Nightly from the host's crontab: 0 4 * * * /opt/poroleague/scripts/backup.sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
sqlite3 data/poroleague.db ".backup backups/poroleague-$(date +%F).db"
# -mtime +13: older than 14 full days, so the 14 newest nightly backups stay.
find backups -name 'poroleague-*.db' -mtime +13 -delete
