# Operations

Running the site: hosts, deploys, backups, restores, and keeping rules and legends current.

## Deploy

CI builds the image on every PR without pushing it. A passing push to `main` publishes `ghcr.io/porobound/poroleague:main` and a commit-SHA tag. The dev server runs `:main`; prod runs `:prod`, which only moves when you promote. Both hosts pull new images on their own every 5 minutes.

```
merge to main ──► :main + :<sha> ──► dev server
Actions → promote ──► :prod = :<sha> ──► prod
```

Each host runs the image with Docker Compose next to a `cloudflared` tunnel, so no ports are open. The container applies migrations on start, then serves on port 3000.

### First-time host setup

The image is public, so the host needs no registry login.

1. Make a directory, e.g. `/opt/poroleague`, and copy in `compose.yaml`, `scripts/backup.sh` and `scripts/deploy.sh`.
2. `mkdir data && sudo chown 1000:1000 data`. The app runs as uid 1000 and keeps the database in `data/poroleague.db`.
3. In Cloudflare **Zero Trust → Networks → Tunnels**, create a tunnel, copy its token, and add a public hostname pointing to `http://app:3000`.
4. Write `.env`: every variable from `.env.example`, plus `ORIGIN=https://<domain>` and `TUNNEL_TOKEN`. Use the production Discord application with `DISCORD_REDIRECT_URI=https://<domain>/auth/callback`, and set the same redirect in the developer portal. Compose sets `DATABASE_URL`.
5. `docker compose up -d`.
6. Set up [backups](#backups).
7. Auto-deploy: add `scripts/deploy.sh` to root's crontab: `*/5 * * * * /opt/poroleague/scripts/deploy.sh >> /var/log/poroleague-deploy.log 2>&1`. It pulls, and only when that brings a new image does it run a backup (`backups/poroleague-<date>-predeploy.db`, uploaded like the nightly one) and restart the app. A failed backup stops the deploy and the next run retries; the log has a line per deploy and errors only. Each deploy, and the first failure per image, is posted to `WEBHOOK_ORGANIZERS_URL` from `.env` with a link to the commit.

**Cloning an existing host's LXC?** First regenerate its SSH host keys (`rm /etc/ssh/ssh_host_* && ssh-keygen -A && systemctl restart ssh`), delete the copied `/root/.config/rclone/rclone.conf`, `/root/.poroleague-hc-url`, `data/*` and `backups/*`, run `crontab -r`, and write a fresh `.env`. A clone that keeps the other host's tunnel token joins that tunnel and serves its traffic from the wrong database.

### Promote and roll back

**Actions → promote → Run workflow** on `main` points `:prod` at that commit's image, with no rebuild: prod gets the exact image the dev server ran. Prod picks it up within 5 minutes. To roll back, run promote again with the last good commit's full SHA in `sha`. The repo's **Deployments** list (`production`) shows every promote.

The container applies migrations on start, so promoting is also when prod's database migrates. Rolling back to an image from before a migration doesn't undo it: the old code runs against the new schema. The deploy takes a backup just before the new image starts (`poroleague-<date>-predeploy.db`): restore that one together with the old image to undo a migration.

To deploy by hand instead of waiting: `scripts/deploy.sh`.

### Dev server

Same setup in its own directory (e.g. `/opt/poroleague-dev`, also in its cron line) with its own tunnel and hostname (e.g. `dev.<domain>`), and `IMAGE_TAG=main`. Use your **dev** Discord application and test server, never the real Porobound ones, and add `https://dev.<domain>/auth/callback` as a redirect there. Backups use the dev bucket and their own healthchecks check, at `30 4 * * *` so the two hosts don't overlap.

To start from demo data, copy a `local.db` to `data/poroleague.db` before the first `up`, then `chown 1000:1000 data/poroleague.db`. A root-owned database serves pages but fails on the first write (login) with `attempt to write a readonly database`.

To put a branch on it: **Actions → ci → Run workflow** on that branch pushes `:<sha>` only. Set `IMAGE_TAG=<sha>` in the dev server's `.env` and it deploys on the next `deploy.sh` run. Set it back to `main` when done.

## API rate limit

The public API (`/api/v1`, documented in `src/lib/server/openapi.json`) is rate-limited at Cloudflare, not in the app. Zone `porobound.com` → **Security → WAF → Rate limiting rules**, rule "Poroleague public API: 30 req / 10 s per IP":

- Match: `http.host eq "league.porobound.com" and starts_with(http.request.uri.path, "/api/")`. The host check matters: the apex `porobound.com` is another site. The `/api` reference page has no trailing slash, so it isn't counted; its spec and try-it requests are.
- Counted per IP and Cloudflare data centre: 30 requests per 10 s, then block (`429`) for 10 s. Those are the Free plan's fixed period and timeout.
- It's the zone's only Free-plan rate-limit rule. Another limit would have to share it (widen the expression) or needs a paid plan.
- The dev server isn't limited: it's on another zone.

Check after changing it: 40 quick requests to `/api/v1/seasons` should give 30 × `200`, then `429`, and pages should still load.

`scripts/backup.sh` runs nightly from root's crontab. It writes `backups/poroleague-<date>.db` (root-only, 14 kept), uploads it with rclone to an encrypted R2 bucket, then pings healthchecks.io. If any step fails, including a missing `data/poroleague.db`, it skips the ping so healthchecks alerts. Decisions: [#32](https://github.com/Porobound/poroleague/issues/32).

Set this up after the first `docker compose up -d` has created the database.

1. Cloudflare R2: one bucket per environment (`poroleague-backups`, `poroleague-dev-backups`), with a lifecycle rule deleting objects after 30 days (dev: 7). Create an **Object Read & Write** API token scoped to that bucket. Endpoint: `https://<account-id>.r2.cloudflarestorage.com`.
2. Install `cron`, `sqlite3`, `curl`, and rclone from rclone.org (Debian's apt rclone gets `501 NotImplemented` from R2).
3. As root, `rclone config`: remote `r2` (s3, provider Cloudflare, region `auto`, the endpoint, advanced `no_check_bucket = true`) and remote `r2crypt` (crypt over `r2:<bucket>`, generated password and salt). Save the keys, password and salt in the password manager: without them the backups can't be decrypted. No `r2crypt` remote = upload skipped.
4. healthchecks.io: one check per environment, cron schedule matching the crontab (UTC), 1 hour grace. Put its ping URL in `/root/.poroleague-hc-url` (`chmod 600`). No file = ping skipped.
5. `crontab -e`: `0 4 * * * /opt/poroleague/scripts/backup.sh >> /var/log/poroleague-backup.log 2>&1`
6. Check under cron's bare environment: `env -i HOME=/root PATH=/usr/bin:/bin /opt/poroleague/scripts/backup.sh && echo OK`, then `rclone cryptcheck backups r2crypt:` shows 0 differences.

R2 credentials stay in root's rclone config, never in `.env`: compose passes `.env` into the app container, and the app never needs R2.

## Restore

If the host is gone, recreate the rclone remotes from the password manager and fetch the backup:

```sh
rclone copy r2crypt:poroleague-<date>.db backups/
sqlite3 backups/poroleague-<date>.db "pragma integrity_check;"   # ok
```

Then swap it in. The database runs in WAL mode, so delete its `-wal` and `-shm` files first, or SQLite replays the old log onto the restored file:

```sh
docker compose stop app
rm -f data/poroleague.db-wal data/poroleague.db-shm
cp backups/poroleague-<date>.db data/poroleague.db
chown 1000:1000 data/poroleague.db
docker compose start app
```

Log in to check: it's the first write, so a wrong owner shows up as `attempt to write a readonly database`. If players were erased after the backup was made, follow [erasure.md](erasure.md#after-restoring-a-backup) before the site goes live.

### Restore drill

On the dev server, when testers are idle. It restores from R2 only, which proves the off-box copy and the password-manager credentials work:

```sh
cd /opt/poroleague-dev
scripts/backup.sh                                         # fresh backup, uploaded
sqlite3 data/poroleague.db ".backup /root/pre-drill.db"   # undo point
mv backups backups.bak && mkdir -m 700 backups            # force the restore to come from R2
```

Run both blocks under [Restore](#restore) with today's date, compare row counts against `/root/pre-drill.db`, and log in. Clean up: `rm -rf backups && mv backups.bak backups && rm /root/pre-drill.db`.

## Updating the rules

Edit [`rules.md`](rules.md) in a PR. The site renders it at `/rules` from the next deploy, up to the "Ideas for future seasons" heading.

Headings become link targets: `## 5. Reporting results` is `/rules#5-reporting-results`. The site links to `#4-points-and-standings` and `#5-reporting-results`, so when you rename or renumber those, update the links. Unit and e2e tests fail if they break.

## Updating legends

New Riftbound sets come out about every quarter. Add their legends to `src/lib/legends.ts`:

1. Find the new set's legends in [Piltover Archive's legend list](https://piltoverarchive.com/cards?types=legend&rarities=rare).
2. Add each by champion name, in A–Z order. If a champion gets a second legend, give both entries the community nickname, like `Master Yi (PG)` and `Master Yi (XP)`. That renames the existing entry; see below.
3. `npm run check && npx vitest run`, then open a PR.

Matches store the legend's name as text. Never remove a legend that has been picked, and when you rename one, rename its old picks too, or its stats start from zero. On the server, with the app stopped:

```sh
sqlite3 data/poroleague.db "UPDATE matches SET p1_legend = 'Jinx (A)' WHERE p1_legend = 'Jinx'; UPDATE matches SET p2_legend = 'Jinx (A)' WHERE p2_legend = 'Jinx';"
```
