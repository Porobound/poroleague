# Poroleague

League website for the Porobound community's Riftbound TCG league. Players log in with Discord, sign up for a season and report their own matches. Organizers run the season: groups, results, drops and tiebreaks.

- **Rules:** [`docs/rules.md`](docs/rules.md), shown on the site at `/rules`
- **Spec:** [`docs/spec.md`](docs/spec.md)
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)
- **Tracking:** [GitHub project](https://github.com/orgs/Porobound/projects/1) and milestones

## Status

| Plan                  | State                                                 |
| --------------------- | ----------------------------------------------------- |
| 1. Foundation         | Done: schema, round robin, groups, standings (tested) |
| 2. Shell & auth       | Done: app shell, Discord login, sessions              |
| 3. Season & signup    | Done: create season, signup, group draw, schedule     |
| 4. Reporting          | Done: report, flag, audit rows, Discord posts         |
| 5. Standings & pages  | Done: standings, schedule, legends, player pages      |
| 6. Admin              | Done: overview, players, groups, results, finalize    |
| 7. Deploy             | Done: Docker image, compose + cloudflared, backups    |
| 8. Bot API            | Later: when a Discord bot is being built (#8)         |
| 9. Mobile sweep       | Done: phone layouts for every view, phone checker     |
| 10. Weekly publishing | Done: players see a week once organizers publish it   |
| 11. Design nits       | Done: copy cuts, compact phone season card            |
| 12. Browser tests     | Done: Playwright for every flow, CSRF, phone layouts  |

## Stack

SvelteKit 3 (adapter-node) · TypeScript · SQLite via Drizzle ORM (better-sqlite3) · Vitest · Playwright. Login is hand-rolled Discord OAuth (`identify guilds.members.read`). Only members of one Discord server (`GUILD_ID`) can log in, and the organizer role comes from that server.

## Local setup

> **Develop against your own Discord server and your own Discord application. Never the real Porobound ones.**
> Your dev site would log in real members, and your test results would post into Porobound's channels. Each developer makes their own test server and app. Both are free and take about 10 minutes.

You need **Node 24** (`node -v`). The dev scripts run `.ts` files with plain `node`.

### 1. Install

```sh
npm install
cp .env.example .env
```

`.env` is gitignored. Never commit it, and never paste its values into issues or chat.

### 2. Make a Discord test server

1. In Discord, click **+** in the server list → **Create My Own** → **For me and my friends**. Name it something like `poroleague-dev`.
2. Create an organizer role: **Server Settings → Roles → Create Role**, name it `Organizer`, save.
3. **Give that role to yourself:** on the same role, **Manage Members → Add Members** → pick yourself. Owning the server is not enough, because the app only checks for the role.
4. Turn on **Developer Mode**: **User Settings → Advanced → Developer Mode**. This adds the "Copy ID" menu items.
5. Right-click your server icon → **Copy Server ID** → that's `GUILD_ID`.
6. **Server Settings → Roles**, right-click `Organizer` → **Copy Role ID** → that's `ORGANIZER_ROLE_ID`.

### 3. Make a Discord application

1. Go to https://discord.com/developers/applications → **New Application** (any name).
2. Open **OAuth2**.
   - Copy **Client ID** → `DISCORD_CLIENT_ID`.
   - **Reset Secret** and copy it → `DISCORD_CLIENT_SECRET`. Discord shows it only once.
   - Under **Redirects**, add exactly `http://localhost:5173/auth/callback` (not `127.0.0.1`, no trailing slash) and **Save Changes**.
3. You don't need a bot, and the app doesn't have to join your server.

### 4. Discord webhooks (optional)

Results and flags are posted to Discord channels. To see them, make a webhook in **your test server**: **Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL**, and paste the **whole URL** (`https://discord.com/api/webhooks/<id>/<token>`, not just the ID). One channel for results, one for organizers, one for weekly pairings (they can be the same channel).

To keep posting off, leave them empty, but keep the lines: `WEBHOOK_RESULTS_URL=`, `WEBHOOK_ORGANIZERS_URL=` and `WEBHOOK_PAIRINGS_URL=`.

### 5. Fill in `.env`

```sh
DATABASE_URL=local.db
DISCORD_CLIENT_ID=<from step 3>
DISCORD_CLIENT_SECRET=<from step 3>
DISCORD_REDIRECT_URI=http://localhost:5173/auth/callback
GUILD_ID=<your test server, step 2>
ORGANIZER_ROLE_ID=<your Organizer role, step 2>
WEBHOOK_RESULTS_URL=<optional, step 4>
WEBHOOK_ORGANIZERS_URL=<optional, step 4>
WEBHOOK_PAIRINGS_URL=<optional, step 4>
```

Every variable has to be present or the app refuses to start ("Value is missing"). Only the webhook ones may be empty.

### 6. Database and run

```sh
npm run db:migrate
npm run dev
```

`db:migrate` creates `local.db` (SQLite, gitignored). Run it again after pulling new migrations. Open http://localhost:5173 and log in with the Discord account that's in your test server. If you have the role, you'll see an **Admin** link.

To start over, delete `local.db` and run `npm run db:migrate` again.

### Testing a season with fake players

Your test server has one real player: you. These dev-only scripts fill in the rest:

1. **Admin → New season**, then **Open signup**, and sign up yourself on the season page.
2. Add fake players. Use the season's **slug** (from its URL, e.g. `autumn-2026`), not its name:
   ```sh
   npm run db:seed-dev -- <season-slug> [count]   # default 24; 16+ makes two groups
   ```
3. **Close signup** (draws groups) → **Groups → Lock** (builds the schedule).
4. Your matches are listed on the season page. To test flagging, have a fake opponent report one of your matches (the match id is the number at the end of the match URL; your Discord id via right-click yourself → **Copy User ID**):
   ```sh
   npm run db:report-dev -- <match-id> <your-discord-id>
   ```
5. To fill the season with results (only dev-vs-dev matches, so yours stay open to report):
   ```sh
   npm run db:play-dev -- <season-slug> [share]   # share of the schedule to play, default 0.6; --drop drops a dev player
   ```

### Troubleshooting

| Symptom                                       | Fix                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App won't start: "Value is missing"           | A variable is missing from `.env`. Compare with `.env.example`.                                                                                        |
| Discord says "Invalid OAuth2 redirect_uri"    | `DISCORD_REDIRECT_URI` and the redirect in the developer portal must match exactly.                                                                    |
| "This account isn't in the Porobound Discord" | You logged in with an account that isn't in your test server, or `GUILD_ID` is wrong. The page says "Porobound", but in dev it means your test server. |
| No **Admin** link                             | You don't have the role, or `ORGANIZER_ROLE_ID` is wrong. After fixing it, log out and back in (the link uses the role from login).                    |
| Webhooks post nothing                         | Use the full webhook URL, then restart `npm run dev` (env is read at startup). Errors show as `Discord webhook failed: <status>`.                      |
| Data shows up in the wrong place              | Run only one `npm run dev` per checkout: dev servers share `.svelte-kit/`, and a second one overrides the first one's env.                             |

## Environment variables

| Variable                 | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `DATABASE_URL`           | SQLite file path (`local.db`)                             |
| `DISCORD_CLIENT_ID`      | Discord application client ID                             |
| `DISCORD_CLIENT_SECRET`  | Discord application client secret                         |
| `DISCORD_REDIRECT_URI`   | OAuth redirect; must match the one set in Discord exactly |
| `GUILD_ID`               | Discord server whose members can log in                   |
| `ORGANIZER_ROLE_ID`      | Discord role that makes someone an organizer              |
| `WEBHOOK_RESULTS_URL`    | Discord webhook for reported results (empty = off)        |
| `WEBHOOK_ORGANIZERS_URL` | Discord webhook for flags (empty = off)                   |
| `WEBHOOK_PAIRINGS_URL`   | Discord webhook for weekly pairings (empty = off)         |
| `ORIGIN`                 | Servers only: public URL, e.g. `https://<domain>`         |
| `TUNNEL_TOKEN`           | Servers only: Cloudflare Tunnel token (compose)           |
| `IMAGE_TAG`              | Servers only: image tag (empty = `latest`, `dev`, a SHA)  |

Declare new variables in `src/env.ts` and add them to `.env.example`.

## Commands

| Command                                      | What it does                                           |
| -------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                | Dev server on :5173                                    |
| `npm run check`                              | Type-check (svelte-check)                              |
| `npx vitest run`                             | Unit tests                                             |
| `npm run test:e2e`                           | Browser tests against a throwaway database             |
| `npm run build` / `npm run preview`          | Production build / serve it locally                    |
| `npm run lint` / `npm run format`            | Prettier check / fix                                   |
| `npm run db:generate` / `npm run db:migrate` | Create a migration from `schema.ts` / apply migrations |
| `npm run db:studio`                          | Browse the database in the browser                     |
| `npm run db:seed-dev -- <slug> [count]`      | Dev: sign up fake players                              |
| `npm run db:report-dev -- <match> <you>`     | Dev: report a match as your opponent                   |
| `npm run db:play-dev -- <slug> [share]`      | Dev: play out a season with fake results               |

CSRF origin checks only run in production builds. Test cross-site POST behaviour with `build` + `preview`, not `dev`.

## Layout

```
src/
  lib/league/          pure league rules (score, round robin, groups, standings, report modes, deadline), unit-tested
  lib/discord.ts       pure Discord helpers (authorize URL, profile, safe return path, post embeds)
  lib/season.ts        pure season form parsing and labels
  lib/server/          DB, sessions, seasons, matches, Discord HTTP calls and webhooks (server-only)
  lib/styles/          design-system CSS snapshot (pb- classes)
  lib/components/      Svelte components
  routes/              pages and endpoints (auth/ = OAuth, login/ = refusal pages, admin/, seasons/, players/ = career)
  hooks.server.ts      session cookie → locals.user
drizzle/               SQL migrations (commit these)
e2e/                   Playwright browser tests, seed and fixtures
scripts/               migrate.ts (container start), backup.sh (host cron), dev-only data helpers
Dockerfile             server image
compose.yaml           host stack: app + cloudflared
.github/workflows/     CI: lint, check, tests, e2e on PRs; image to GHCR from main and dev
docs/                  spec, plans, rules (rendered at /rules)
```

## Browser tests

`npm run test:e2e` runs the Playwright tests in `e2e/` in your installed Google Chrome (no browser download). It builds the app, migrates and seeds a throwaway database in the system temp dir, serves it with `vite preview` on :4317, runs the tests and deletes the database. It never opens `local.db` and leaves `npm run dev` on :5173 alone, so it's safe to run while you develop.

- Every env variable comes from `playwright.config.ts`, not `.env`. Discord is unreachable (dead proxy), so fake organizer sessions keep their role; the `ECONNREFUSED 127.0.0.1:9` lines in the output are that role check failing, as intended.
- Webhooks post to a listener on :4318 (`e2e/global.ts`) instead of Discord. Tests read what was posted with `posts(channel)` from `e2e/fixtures.ts`.
- The startup seed only adds the organizer `org`. Each spec seeds its own season and players in `beforeAll` and soft-deletes the season in `afterAll` (`e2e/db.ts`), because the site allows one running season at a time. Specs run one at a time and never see each other's writes.
- Every seeded player has a session. Log in with `test.use(as(id))`, or `browser.newPage(as(id))` when a test needs several people.
- Select by role, label and text, never by CSS class.
- `e2e/mobile.spec.ts` opens every page at 390 × 844 as a visitor, a player and an organizer, and fails if one scrolls sideways or has something cut off at the right edge. Controls under 44 px tall are printed as warnings (`N small  <role> <path>`), not failures.
- CI runs it as a separate `e2e` job on PRs.

## Deploy

CI lints, typechecks, tests and builds the image on every PR (without pushing it). Every push to `main` that passes builds `ghcr.io/porobound/poroleague:latest`, and every push to the `dev` branch builds `:dev`. Both also get a tag with the commit SHA. The host runs it with Docker Compose next to a `cloudflared` tunnel, so no ports are open. The container applies migrations on start, then serves on port 3000.

### First-time host setup

The image is public, so the host needs no registry login.

1. Make a directory, e.g. `/opt/poroleague`, and copy in `compose.yaml` and `scripts/backup.sh`.
2. `mkdir data && sudo chown 1000:1000 data`. The app runs as uid 1000 and keeps the database in `data/poroleague.db`.
3. In Cloudflare **Zero Trust → Networks → Tunnels**, create a tunnel, copy its token, and add a public hostname pointing to `http://app:3000`.
4. Write `.env` with the production values: every variable from `.env.example`, plus `ORIGIN=https://<domain>` and `TUNNEL_TOKEN`. Use the production Discord application, with `DISCORD_REDIRECT_URI=https://<domain>/auth/callback` (set the same redirect in the developer portal). `DATABASE_URL` is set by compose and can stay as is.
5. `docker compose up -d`.
6. Backups: see [Backups](#backups).

### Backups

`scripts/backup.sh` runs nightly from root's crontab. It writes `backups/poroleague-<date>.db` (root-only, 14 kept), uploads with rclone to an encrypted R2 bucket, then pings healthchecks.io. Full runbook and decisions: [#32](https://github.com/Porobound/poroleague/issues/32).

1. Cloudflare R2: one bucket per environment (`poroleague-backups`, `poroleague-dev-backups`), with a lifecycle rule deleting objects after 30 days (dev: 7). Create an **Object Read & Write** API token scoped to that bucket only.
2. Install `cron`, `sqlite3`, `curl`, and rclone from rclone.org (Debian's apt rclone gets `501 NotImplemented` from R2).
3. As root, `rclone config`: remote `r2` (s3, provider Cloudflare, region `auto`, account endpoint, advanced `no_check_bucket = true`), and remote `r2crypt` (crypt over `r2:<bucket>`, generated password and salt). Save the keys, password and salt in the password manager: without them the backups can't be decrypted. No `r2crypt` remote = upload skipped.
4. healthchecks.io: a check with schedule `0 4 * * *` (UTC), 1 hour grace. Put its ping URL in `/root/.poroleague-hc-url` (`chmod 600`). No file = ping skipped.
5. `crontab -e`: `0 4 * * * /opt/poroleague/scripts/backup.sh >> /var/log/poroleague-backup.log 2>&1`
6. Check under cron's bare environment: `env -i HOME=/root PATH=/usr/bin:/bin /opt/poroleague/scripts/backup.sh && echo OK`, then `rclone cryptcheck backups r2crypt:` shows 0 differences.

Credentials stay in root's rclone config, never in `.env`: compose passes `.env` into the app container, and the app never needs R2.

### Update

```sh
docker compose pull && docker compose up -d
```

To roll back, set `IMAGE_TAG=<sha>` of the last good commit in `.env` and run the same two commands. Clear it to go back to `latest`.

### Dev server

Same setup in its own directory (e.g. `/opt/poroleague-dev`), with its own tunnel and hostname (e.g. `dev.<domain>`), and `IMAGE_TAG=dev` in `.env`. Point it at your **dev** Discord application and test server, never the real Porobound ones, and add `https://dev.<domain>/auth/callback` as a redirect in that application. Backups are optional. To start from demo data, copy a `local.db` to `data/poroleague.db` before the first `up`, then `chown 1000:1000 data/poroleague.db`. A root-owned database still serves pages but fails on the first write (login) with `attempt to write a readonly database`.

To put any branch on it:

```sh
git push --force origin HEAD:dev
```

CI checks it and builds `:dev`. Then on the dev server: `docker compose pull && docker compose up -d`.

### Restore

If the host is gone, recreate the rclone remotes from the password manager and fetch the backup first:

```sh
rclone copy r2crypt:poroleague-<date>.db backups/
sqlite3 backups/poroleague-<date>.db "pragma integrity_check;"   # ok
```

Then:

```sh
docker compose stop app
rm -f data/poroleague.db-wal data/poroleague.db-shm
cp backups/poroleague-<date>.db data/poroleague.db
chown 1000:1000 data/poroleague.db
docker compose start app
```

The database runs in WAL mode: delete its `-wal` and `-shm` files before copying a backup over it, or SQLite replays the old log onto the restored file.

## Updating the rules

Edit [`docs/rules.md`](docs/rules.md) in a PR. The site renders it at `/rules` from the next deploy, up to the "Ideas for future seasons" heading. Everything from there on stays in the doc only.

Each heading becomes a link target: `## 5. Reporting results` is `/rules#5-reporting-results`. The site links to `#4-points-and-standings` and `#5-reporting-results`, so when you rename or renumber those headings, update the links too. `npx vitest run` and `npm run test:e2e` fail if they break.

## Updating legends

New Riftbound sets come out about every quarter. When one does, add its legends to `src/lib/legends.ts`:

1. Open [the legend list on Piltover Archive](https://piltoverarchive.com/cards?types=legend&rarities=rare) and find the new set's legends.
2. Add each one by champion name, keeping the list in A–Z order. If a champion gets a second legend, give both entries the community nickname, like `Master Yi (PG)` and `Master Yi (XP)`. That renames the existing entry, so see below.
3. Run `npm run check` and `npx vitest run`, then open a PR.

Each match stores the legend's name as text. So never remove a legend that has been picked, and when you rename one, rename its old picks in the database too. Otherwise its stats start from zero. On the server, with the app stopped:

```sh
sqlite3 data/poroleague.db "UPDATE matches SET p1_legend = 'Jinx (A)' WHERE p1_legend = 'Jinx'; UPDATE matches SET p2_legend = 'Jinx (A)' WHERE p2_legend = 'Jinx';"
```

## Contributing

- `main` is protected: open a PR, get one approval, squash or rebase merge.
- CI runs `npm run lint`, `npm run check` and `npx vitest run` on every PR, and `npm run test:e2e` as a separate job. Run `npm run format` before pushing.
- Every change comes with tests in the same PR: unit tests for logic and server code, browser tests (`e2e/`) for pages and flows. A bug fix gets a test that fails without the fix.
- League rules live only in `src/lib/league/`, and routes call them. Every result change writes an audit row.
- See [`CLAUDE.md`](CLAUDE.md) for code conventions (`#lib/…ts` imports, env vars, styling).
