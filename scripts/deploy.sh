#!/bin/sh
# Every 5 minutes from root's crontab, after the first `docker compose up -d`:
# */5 * * * * /opt/poroleague/scripts/deploy.sh >> /var/log/poroleague-deploy.log 2>&1
set -eu
cd "$(dirname "$0")/.."
# Compose prints Pulling/Pulled even with -q: keep it out of the log unless the pull fails.
out=$(docker compose pull -q app 2>&1) || { echo "$out" >&2; exit 1; }
image=$(docker compose config --images app)
running=$(docker inspect -f '{{.Image}}' "$(docker compose ps -aq app)" 2>/dev/null || true)
[ "$running" = "$(docker image inspect -f '{{.Id}}' "$image")" ] && exit 0
# The new image migrates on start and rolling back the image doesn't undo that, so back up first.
# A failed backup stops the deploy; the next run retries.
scripts/backup.sh predeploy
docker compose up -d app
docker image prune -f > /dev/null
echo "$(date -Is) deployed $image $(docker image inspect -f '{{.Id}}' "$image")"
