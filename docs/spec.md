# Poroleague — Spec

Website for a small community Riftbound TCG league (~20–30 players). Players log in with Discord, self-report matches; organizers run the season.

## Season lifecycle

`draft → signup → groups → play → finished`

1. **draft** — organizer creates season: name, slug, start date, round length (days, default 7), season deadline, top-cut size X.
2. **signup** — any member of the Discord guild can join until an organizer closes signup. Organizers can remove a signup.
3. **groups** — organizer picks group count (default: 1 if < 16 signups, else 2), draws random groups, previews, swaps players, locks. Uneven sizes allowed (25 → 13 + 12). Locking generates the round-robin schedule (circle method, byes on odd counts).
4. **play** — weekly rounds. Round deadlines are soft; late matches report normally. Season deadline is hard.
5. **finished** — organizer enters results for any unplayed matches (else double loss), breaks unresolved ties, finalizes.

Top cut (top X per group, cross-seeded A1 vs B4 …, single elim, Bo3, online, same report flow) is **deferred**. Data model already carries `stage` + `round` for it.

## Matches & scoring

- Bo3. Result = game score: 2-0, 2-1, 1-1 (and mirrors). 1-1 = draw (time / unfinished).
- Also recorded: each player's legend (chosen per match, pre-filled with player's last-used legend), dice-roll winner (per match).
- Points: win 3, draw 1, loss 0.
- Tiebreakers: points → head-to-head (mini-league among tied players) → game-win % → organizer decision (manual `tiebreak` rank).
- Unplayed at season deadline = double loss (0 pts both, counts as played + loss) unless organizer enters a result.
- **Drops:** organizer marks a player dropped → all their matches (played and unplayed) are void: kept in DB, excluded from standings. Dropped player can't report; shown as "dropped" in the group.
- Legends list lives in a config file (`src/lib/legends.ts`), updated by hand when sets release.

## Reporting & trust

- Only signed-up, non-dropped players report, and only their own matches.
- Reporter's result counts immediately.
- Reporter may edit their report until the opponent flags it. Opponent never edits — only flags (with reason).
- After a flag: only organizers change the result.
- Every result change (report, edit, flag, organizer edit, drop) goes to a public audit log: who, what, when, before/after.

## Auth & roles

- Discord OAuth, scopes `identify guilds.members.read`. Hand-rolled (~60 lines), no auth library.
- At login: `GET /users/@me/guilds/{GUILD_ID}/member` with the user's token. 404 → not a guild member → login refused. Response gives server nickname (display name, fallback global name) and roles.
- Organizer = has `ORGANIZER_ROLE_ID`. Stored in session; **rechecked on every `/admin` action** (one API call) so revocation is immediate.
- Sessions in SQLite, ~7-day expiry. Display name refreshed each login.
- Organizers may play; edits to their own matches are allowed and visible in the audit log.

## Organizer powers (`/admin` per season)

| Phase   | Actions                                                              |
| ------- | -------------------------------------------------------------------- |
| Setup   | Create season, edit settings                                          |
| Signup  | Open/close signup, remove signup                                      |
| Groups  | Choose group count, draw, swap in preview, lock (generates schedule)  |
| Play    | Edit any result, resolve flags, mark player dropped, post round pairings to Discord |
| End     | Enter unplayed results, set tiebreak ranks, finalize season           |

Not in UI: managing organizers (Discord role), legend list (config file), messaging (Discord).

## Pages (all public; login only for actions)

- `/` — current season (latest non-draft) overview
- `/seasons` — archive
- `/seasons/[slug]` — groups + standings
- `/seasons/[slug]/schedule` — rounds and results
- `/seasons/[slug]/players/[id]` — player page: this season's matches, legends played, "report" buttons, "who do I play this week"
- `/seasons/[slug]/audit` — audit log
- `/seasons/[slug]/admin` — organizer tools
- Report form: score, both legends, dice-roll winner.

Career stats across seasons: **deferred**.

## Discord integration

- **v1 (in site):** webhooks, URLs in env vars, one `fetch` per event.
  - results channel: every reported result ("Alice 2-1 Bob (Jinx vs Ahri, Alice won the roll)")
  - organizer channel: flags, drops
  - "Post round pairings" button in admin
- **Bot (separate repo, later):** talks to the site only via its HTTP JSON endpoints with a service token (`BOT_TOKEN`). Site owns DB and all rules; bot never touches the DB. A bot `/report` calls the same endpoint as the web form, acting as the player.

## Stack

- SvelteKit + `adapter-node`, TypeScript
- SQLite via Drizzle (`better-sqlite3`), migrations via drizzle-kit
- Vitest — unit tests on pure league logic only (standings/tiebreakers, round-robin, group split, score validation)
- Styling: from Claude Design output (see below); Pico.css only as fallback

## Visual design

Designs come from Claude Design as HTML. Integration rule: **extract, don't paste.**

- Colors, type, spacing → CSS custom properties in `src/app.css`.
- Page chrome → `src/routes/+layout.svelte`; repeated pieces (standings table, match card, report form) → Svelte components.
- Timing: Plan 1 (foundation) has no UI, so design work runs in parallel. Plan 2 opens with "app shell from design" before any page is built. Needed by then: at minimum standings page + player page + report form mockups.

## Ops

- Docker on Proxmox, one app container, SQLite file on a mounted volume.
- Exposed via `cloudflared` sidecar (Cloudflare Tunnel), no open ports.
- Nightly `sqlite3 .backup` via cron, copied off-box.
- GitHub Actions builds image → GHCR on push to `main`; deploy = manual `docker compose pull && docker compose up -d`.
- Migrations run on container start.

## Env vars

`DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `GUILD_ID`, `ORGANIZER_ROLE_ID`, `WEBHOOK_RESULTS_URL`, `WEBHOOK_ORGANIZERS_URL`, `BOT_TOKEN`, `ORIGIN` (adapter-node).

## Open items

- Domain (needed for Discord OAuth app redirect URI in prod; dev uses `http://localhost:5173`).
- Real Riftbound legend list — `src/lib/legends.ts` starts with ~30 placeholder LoL champion names.
- Top-cut size X; top-cut feature; career stats.

## Plan roadmap

1. **Foundation** — scaffold, schema, pure league logic (TDD). `docs/superpowers/plans/2026-10-21-foundation.md`
2. **Shell & auth** — app shell from design, Discord login, sessions, guild/role check.
3. **Season & signup** — create season, signup flow, group draw/lock, schedule generation.
4. **Reporting** — report form, edit-until-flagged, flags, audit log, results webhook.
5. **Standings & pages** — standings, schedule, player page, archive, audit page.
6. **Admin** — organizer edits, drops, flag resolution, deadline/finalize, tiebreak ranks, round-pairings post.
7. **Deploy** — Dockerfile, compose with cloudflared, GH Actions → GHCR, backup cron.
8. **Bot API** — service-token JSON endpoints (when bot work starts).

Each plan is written when the previous one lands, against the real code.
