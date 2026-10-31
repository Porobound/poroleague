#!/bin/sh
# Every 5 minutes from root's crontab, after the first `docker compose up -d`:
# */5 * * * * /opt/poroleague/scripts/deploy.sh >> /var/log/poroleague-deploy.log 2>&1
set -eu
cd "$(dirname "$0")/.."
# Compose prints Pulling/Pulled even with -q: keep it out of the log unless the pull fails.
out=$(docker compose pull -q app 2>&1) || { echo "$out" >&2; exit 1; }
image=$(docker compose config --images app)
new=$(docker image inspect -f '{{.Id}}' "$image")
running=$(docker inspect -f '{{.Image}}' "$(docker compose ps -aq app)" 2>/dev/null || true)
[ "$running" = "$new" ] && exit 0

dotenv() { sed -n "s/^$1=//p" .env | tr -d "\"'"; }
hook=$(dotenv WEBHOOK_ORGANIZERS_URL)
site=$(dotenv ORIGIN)
rev=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
what=$([ -n "$rev" ] && echo "[\`$(echo "$rev" | cut -c1-7)\`](<https://github.com/Porobound/poroleague/commit/$rev>)" || echo "\`$image\`")
notify() {
	[ -n "$hook" ] || return 0
	curl -fsS -m 10 -o /dev/null -H 'Content-Type: application/json' \
		-d "{\"content\":\"$1\",\"allowed_mentions\":{\"parse\":[]}}" "$hook" || true
}
# Every run retries a failed deploy; post the failure once per image, not every 5 minutes.
fail() {
	echo "$(date -Is) deploy of $image failed: $1" >&2
	[ "$(cat .deploy-failed 2>/dev/null)" = "$new" ] ||
		notify "Deploy of $what to $site failed: $1. See /var/log/poroleague-deploy.log."
	echo "$new" > .deploy-failed
	exit 1
}

# The new image migrates on start and rolling back the image doesn't undo that, so back up first.
scripts/backup.sh predeploy || fail backup
docker compose up -d app || fail start
rm -f .deploy-failed
docker image prune -f > /dev/null
echo "$(date -Is) deployed $image $new"
notify "Deployed $what to $site."
