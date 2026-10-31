# Poroleague — Spec

Public name: **Poroleague** (the league site). **Porobound** is the private Discord community it serves; UI copy says "Porobound" only when it means that server. Website for a small community Riftbound TCG league (~20–30 players). Players log in with Discord, self-report matches; organizers run the season.

## Season lifecycle

`draft → signup → groups → play → finished`

Only one season can be running (signup, groups or play) at a time; drafts and finished seasons are unlimited.

1. **draft** — organizer creates season: name, slug, start date, rounds per week (default 2), season deadline, top-cut size X (editable until the season finishes, since it only moves the line in the standings), signup limits (below).
2. **signup** — any member of the Discord guild can join until the season is full or an organizer closes signup. Players can withdraw while signup is open; organizers can remove a signup.
3. **groups** — group count is automatic: the fewest groups of at most the season's group size, kept within one player of each other (25 at size 16 → 13 + 12); organizer draws random groups, previews, swaps players, locks. Locking generates the round-robin schedule (circle method, byes on odd counts).

**Signup limits** (per season, `seasons.max_players` default 128, `seasons.group_size` default 16):

- Editable in draft and signup; locked from groups on (reopening signup unlocks them). Audited like other season fields.
- Group size 4–32. Max players 2 to `min(128, 8 × group size)`: at most 8 groups (`MAX_GROUPS`), never more than 128 players.
- Saving a max below the current signup count is refused ("30 already signed up. Remove players or set 30 or more."); nobody is removed automatically.
- Joining is refused once the season is full; a spot opens when someone withdraws or is removed. No waitlist.
- Signup page shows players: the count against the cap ("23 / 32 · 9 spots left"; just the count when the cap is 128), "Groups of up to N" with a live projection ("23 signed up → 2 groups of 11–12"), and the rough length ("2 rounds a week · about 6 weeks at this size": rounds of the largest projected group ÷ rounds per week, rounded up).
- Admin → Players lists signups in signup order (`entries.created_at`) with a `#` and the signup time until groups are locked; alphabetical by group from then on. A refused save keeps what the organizer typed. Withdrawing deletes the entry, so signing up again goes to the back.
- Out of scope: waitlist, a direct group-count setting, changing limits after the draw.

4. **play** — weeks of `roundsPerWeek` rounds (12-player group: 11 rounds ≈ 6 weeks). A match past its week shows as **overdue** (derived, no stored state); it still reports normally. Weeks are **published** one at a time by an organizer (`seasons.published_round`, the last visible round): players, organizers on public pages and the bot API see only published rounds; Admin → Matches shows all and blocks results for unpublished ones. A published week can't be hidden again. Season deadline is hard: player reporting closes at the deadline. Once groups are drawn, the deadline can't be earlier than the last day of the final round's week: saving such a deadline and locking the groups are both refused. All dates/deadlines are in the league timezone (`LEAGUE_TZ = Europe/Helsinki`, config constant); deadline = 23:59 local on the deadline date.
5. **finished** — organizer enters results for any unplayed matches (else double loss), breaks unresolved ties, finalizes.

**Top cut** (optional, `topCutSize` > 0): finalize moves the season to `topcut` instead of `finished`. Top X non-dropped players per group, seeded by rank then group (A1, B1, A2, …), standard bracket order with first-round same-group rematches swapped away; bracket = next power of two, byes to top seeds. Single elim, Bo3, same report flow; a level result advances the higher seed; no-shows are organizer walkovers. Organizer publishes the bracket and clicks **Finish season** once the final has a winner → `finished`. Plan: `docs/superpowers/plans/2026-10-26-top-cut.md`.

## Matches & scoring

- Bo3. Result = game score: 2-0, 2-1, 1-0, 1-1 (and mirrors). 1-1 = draw (time / unfinished). 1-0 = win (time ran out or called early).
- Also recorded: each player's legend (chosen per match, pre-filled with player's last-used legend), dice-roll winner (per match).
- Points: win 3, draw 1, loss 0.
- Tiebreakers: points → head-to-head (mini-league among tied players) → game-win % → organizer decision (manual `tiebreak` rank).
- Unplayed at season deadline = double loss (0 pts both, counts as played + loss) unless organizer enters a result.
- **Drops:** organizer marks a player dropped → all their matches (played and unplayed) are void: kept in DB, excluded from standings. Dropped player can't report; shown as "dropped" in the group.
- Legends list lives in a config file (`src/lib/legends.ts`), updated by hand when sets release. Report form picks legends from this list (select, not free text).

## Reporting & trust

- Only signed-up, non-dropped players report, and only their own matches.
- Reporter's result counts immediately. The report form asks for confirmation before saving.
- A saved report is final: neither player edits it. Either player (the reporter included, for their own mistakes) flags it with a reason to have an organizer fix it.
- After a flag: only organizers change the result. Organizer either edits the result or keeps it as reported; both resolve the flag (`flagResolvedBy`/`flagResolvedAt`). A resolved result can't be flagged again.
- Every result change (report, edit, flag, organizer edit, drop) goes to a public audit log: who, what, when, before/after.
- Either player may report an unreported match; the first report counts.
- Reporting closes at the season deadline; flagging stays open until the season is finalized, so a last-minute report can still be disputed. A flag (resolved or not) locks the result for both players.
- Void matches (a player dropped) can't be reported or flagged.
- Match page: `/seasons/[slug]/matches/[id]` (report, edit, flag, read-only).

## Auth & roles

- Discord OAuth, scopes `identify guilds.members.read`. Hand-rolled (~60 lines), no auth library.
- At login: `GET /users/@me/guilds/{GUILD_ID}/member` with the user's token. 404 → not a guild member → login refused. Porobound is private: the refusal page offers no invite link, only "try again" (wrong Discord account) and browsing without login. Response gives server nickname (display name, fallback global name) and roles.
- Organizer = has `ORGANIZER_ROLE_ID`. Stored in session; **re-checked with Discord at most once a minute** on admin pages and actions (the member endpoint is heavily rate-limited), so a role change applies within a minute without re-login. If Discord refuses (429) or fails, the last known role is kept.
- Sessions in SQLite, ~7-day expiry. Display name refreshed each login.
- Organizers may play; edits to their own matches are allowed and visible in the audit log.

## Organizer powers (`/admin` per season)

| Phase  | Actions                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Setup  | Create season, edit settings, delete season (soft: hidden, data kept, `deletedBy`/`deletedAt` recorded; typed slug once it has matches) |
| Signup | Open/close signup (closing draws the groups), remove signup, change max players / group size                                            |
| Groups | Redraw, move player between groups, reopen signup (clears the draw), lock (generates schedule)                                          |
| Play   | Edit any result, resolve flags, mark player dropped, publish the next week (posted to Discord when the webhook is set)                  |
| End    | Enter unplayed results, set tiebreak ranks, finalize season                                                                             |

Not in UI: managing organizers (Discord role), legend list (config file), messaging (Discord).

## Pages (all public; login only for actions)

- `/` — the newest non-draft season if it's still running (redirect); else "next season coming soon" if a draft exists; else the newest finished season; no seasons → empty state
- `/admin` — organizers: season list, create season
- `/seasons` — archive
- `/api` — interactive API reference (Scalar) over the OpenAPI spec
- `/seasons/[slug]` — groups + standings
- `/seasons/[slug]/schedule` — rounds and results
- `/seasons/[slug]/players/[id]` — player page: this season's matches, per-legend record ("played as": W-D-L + game-win % per legend; "against": W-D-L vs each opponent legend), "report" buttons, "who do I play this week"
- `/seasons/[slug]/legends` — season legend stats: picks, players, W-D-L, match/game win % per legend; win % hidden under 5 non-mirror matches; click a legend → players who used it with their record
- `/seasons/[slug]/audit` — audit log
- Legend stats (both pages): void (dropped) matches and deadline double losses excluded. Legends page: mirror matches count as picks, not in W-D-L or win %. Player page: mirrors count as normal results.
- `/seasons/[slug]/admin` — organizer tools
- Report form: score, both legends, dice-roll winner.

Career stats across seasons: **deferred**. Wanted: from any player page, see that player's other seasons (finish, points, W-D-L per season, linking to that season's player page) and career totals (W-D-L, game-win %, legends across all seasons) on `/players/[id]`. Design pending (Player board "Past seasons" aside is a start).

## Discord integration

- **v1 (in site):** webhooks, URLs in env vars, one `fetch` per event.
  - results channel: every reported result ("Alice 2-1 Bob (Jinx vs Ahri, Alice won the roll)")
  - organizer channel: flags, drops
  - pairings channel: posted by "Publish week N" in admin when `WEBHOOK_PAIRINGS_URL` is set (all rounds of that week): one message, an embed per round, players as `<@id>` mentions inside embeds (clickable names, no pings)
  - Every webhook post disables mentions (`allowed_mentions: none`), since names and flag reasons are user text; nothing pings, pairings included.
  - No DMs in v1: UI copy says "posted in Discord", never "notified".
- **Player role sync (in site, no bot repo):** one global Discord role (`PLAYER_ROLE_ID`) marks current players. The site calls Discord REST with a bot token (`DISCORD_BOT_TOKEN`): `PUT`/`DELETE /guilds/{GUILD_ID}/members/{id}/roles/{PLAYER_ROLE_ID}`, one `fetch` per event, skipped when the env vars are unset.
  - A player has the role while entered, not dropped, in a running season (`signup` → `topcut`). Signup, withdraw, removal, drop/undrop, erasure, the season reaching `finished` (after top cut, if any) and season delete re-derive it from the DB, so a stale event can't strip the role from someone still playing.
  - All role calls go through one in-process queue, in event order, one at a time, 10 s timeout each. 429 (after `Retry-After`), 5xx and network errors retry up to twice; other 4xx are final; a 404 on removal (member left) counts as done.
  - A failed call never blocks the league action and is logged; drift is fixed by hand in Discord. No backfill: roles for existing players were filled manually.
  - The app's bot user needs Manage Roles, and its role must sit above the player role.

## Public API

Read-only JSON at `/api/v1` for third parties. The OpenAPI 3.1 spec `src/lib/server/openapi.json` is the consumer docs: served at `/api/v1/openapi.json`, rendered at `/api` by Scalar.

- Anonymous `GET` only: `/api/v1/*` skips the session, so every viewer gets the same answer. `Access-Control-Allow-Origin: *`.
- Endpoints: `/seasons`, `/seasons/{slug}`, `/seasons/{slug}/matches`, `/seasons/{slug}/top-cut`, `/seasons/{slug}/legends`. Not exposed: player pages (derivable), audit log (flag reasons), the Elo leaderboard (organizers only).
- Visibility is the public pages': no drafts or deleted seasons, published rounds only, the bracket once published, flag state (`open`/`resolved`) but never the reason.
- Players are `{ id, name, former }`: no avatars (their URL holds the Discord id), no Discord ids.
- Shapes are fixed DTOs in `src/lib/server/api.ts`, separate from page data. v1 only grows; renames or removals mean `/api/v2`.
- Successful responses are cached 60 s; errors are `no-store`. `/api/v1` itself counts as API.
- Contract tests (`src/lib/server/openapi.spec.ts`) hold the spec to the code: real responses validate against it, every object schema is closed, routes match `paths`, and the spec passes the OpenAPI 3.1 meta-schema. A new field fails until it's documented.
- `/api`: `@scalar/api-reference` (exact pin), loaded with `import()` in the browser only, inside the site layout, coloured from Porobound tokens and following `data-theme`. Try-it calls the API on the same origin; no proxy, agent, telemetry or CDN. `<noscript>` links the spec.
- Rate limit: a Cloudflare rule on `league.porobound.com/api/*`, 30 requests / 10 s per IP, block 10 s (`docs/ops.md`).

## Stack

- SvelteKit + `adapter-node`, TypeScript
- SQLite via Drizzle (`better-sqlite3`), migrations via drizzle-kit
- Vitest — unit tests on pure league logic only (standings/tiebreakers, round-robin, group split, score validation, legend stats)
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

`DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `GUILD_ID`, `ORGANIZER_ROLE_ID`, `WEBHOOK_RESULTS_URL`, `WEBHOOK_ORGANIZERS_URL`, `WEBHOOK_PAIRINGS_URL`, `DISCORD_BOT_TOKEN`, `PLAYER_ROLE_ID`, `ORIGIN` (adapter-node), `TUNNEL_TOKEN` (compose, cloudflared).

## Open items

- Domain (needed for Discord OAuth app redirect URI in prod; dev uses `http://localhost:5173`).
- Career stats.

## Plan roadmap

1. **Foundation** — scaffold, schema, pure league logic (TDD). `docs/superpowers/plans/2026-10-21-foundation.md`
2. **Shell & auth** — app shell from design, Discord login, sessions, guild/role check.
3. **Season & signup** — create season, signup flow, group draw/lock, schedule generation.
4. **Reporting** — report form, edit-until-flagged, flags, audit log, results webhook.
5. **Standings & pages** — standings, schedule, player page (incl. per-legend record), legends page, archive, audit page.
6. **Admin** — organizer edits, drops, flag resolution, deadline/finalize, tiebreak ranks, weekly publishing.
7. **Deploy** — Dockerfile, compose with cloudflared, GH Actions → GHCR, backup cron.
8. **Player role sync** — signup/withdraw/drop/season end add or remove the Discord player role via bot-token REST calls.
9. **Mobile sweep** — phone layouts for every view, phone checker script. `docs/superpowers/plans/2026-10-22-mobile.md`
10. **Weekly publishing** — organizers publish each week's pairings; players see published weeks only. `docs/superpowers/plans/2026-10-23-weekly-publishing.md`
11. **Design nits** — copy cuts from the 2026-10-23 design pass, compact phone season card. `docs/superpowers/plans/2026-10-23-design-nits.md`
12. **Public API** — read-only `/api/v1` for third parties, docs page, Cloudflare rate limit. `docs/superpowers/plans/2026-10-31-public-api.md`

Each plan is written when the previous one lands, against the real code.
