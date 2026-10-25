#!/bin/sh
# Nightly from root's crontab:
# 0 4 * * * /opt/poroleague/scripts/backup.sh >> /var/log/poroleague-backup.log 2>&1
set -eu
umask 077
cd "$(dirname "$0")/.."
mkdir -p backups
sqlite3 data/poroleague.db ".backup backups/poroleague-$(date +%F).db"
# -mtime +13: older than 14 full days, so the 14 newest nightly backups stay.
find backups -name 'poroleague-*.db' -mtime +13 -delete
# copy, never sync: sync would mirror a wiped backups/ and delete the off-box copies.
# --max-age: retry the last few nights, but never re-upload what R2's lifecycle rule (dev: 7 days) deleted.
if rclone listremotes 2>/dev/null | grep -qx 'r2crypt:'; then
	rclone copy --max-age 3d backups r2crypt:
fi
# Last, so set -e skips it when anything above fails and healthchecks.io alerts.
if [ -s "$HOME/.poroleague-hc-url" ]; then
	curl -fsS -m 10 --retry 3 -o /dev/null "$(cat "$HOME/.poroleague-hc-url")"
fi
