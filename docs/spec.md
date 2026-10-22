# Poroleague — Spec

Public name: **Poroleague** (the league site). **Porobound** is the private Discord community it serves; UI copy says "Porobound" only when it means that server. Website for a small community Riftbound TCG league (~20–30 players). Players log in with Discord, self-report matches; organizers run the season.

## Season lifecycle

`draft → signup → groups → play → finished`

Only one season can be running (signup, groups or play) at a time; drafts and finished seasons are unlimited.

1. **draft** — organizer creates season: name, slug, start date, rounds per week (default 2), season deadline, top-cut size X (editable until the season finishes, since it only moves the line in the standings).
2. **signup** — any member of the Discord guild can join until an organizer closes signup. Players can withdraw while signup is open; organizers can remove a signup.
3. **groups** — group count is automatic (1 if < 16 signups, else 2); organizer draws random groups, previews, swaps players, locks. Uneven sizes allowed (25 → 13 + 12). Locking generates the round-robin schedule (circle method, byes on odd counts).
4. **play** — weeks of `roundsPerWeek` rounds (12-player group: 11 rounds ≈ 6 weeks). A match past its week shows as **overdue** (derived, no stored state); it still reports normally. Season deadline is hard: player reporting closes at the deadline. All dates/deadlines are in the league timezone (`LEAGUE_TZ = Europe/Helsinki`, config constant); deadline = 23:59 local on the deadline date.
5. **finished** — organizer enters results for any unplayed matches (else double loss), breaks unresolved ties, finalizes.

Top cut (top X per group, cross-seeded A1 vs B4 …, single elim, Bo3, online, same report flow) is **deferred**. Data model already carries `stage` + `round` for it.

## Matches & scoring

- Bo3. Result = game score: 2-0, 2-1, 1-1 (and mirrors). 1-1 = draw (time / unfinished).
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
| Signup | Open/close signup (closing draws the groups), remove signup                                                                             |
| Groups | Redraw, move player between groups, reopen signup (clears the draw), lock (generates schedule)                                          |
| Play   | Edit any result, resolve flags, mark player dropped, post week pairings to Discord                                                      |
| End    | Enter unplayed results, set tiebreak ranks, finalize season                                                                             |

Not in UI: managing organizers (Discord role), legend list (config file), messaging (Discord).

## Pages (all public; login only for actions)

- `/` — the newest non-draft season if it's still running (redirect); else "next season coming soon" if a draft exists; else the newest finished season; no seasons → empty state
- `/admin` — organizers: season list, create season
- `/seasons` — archive
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
  - pairings channel: "Post week N pairings" button in admin (all rounds of that week): one message, an embed per round, players as `<@id>` mentions inside embeds (clickable names, no pings)
  - Every webhook post disables mentions (`allowed_mentions: none`), since names and flag reasons are user text; nothing pings, pairings included.
  - No DMs in v1: UI copy says "posted in Discord", never "notified".
- **Bot (separate repo, later):** talks to the site only via its HTTP JSON endpoints with a service token (`BOT_TOKEN`). Site owns DB and all rules; bot never touches the DB. A bot `/report` calls the same endpoint as the web form, acting as the player.

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

`DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `GUILD_ID`, `ORGANIZER_ROLE_ID`, `WEBHOOK_RESULTS_URL`, `WEBHOOK_ORGANIZERS_URL`, `WEBHOOK_PAIRINGS_URL`, `BOT_TOKEN`, `ORIGIN` (adapter-node).

## Open items

- Domain (needed for Discord OAuth app redirect URI in prod; dev uses `http://localhost:5173`).
- Top-cut size X; top-cut feature; career stats.
- Design nits (non-blocking): drop "Leave as double loss" button; season name needn't lock; organizer edit dialog must cover legends + dice, not just score; timezone label from `Intl` (EET/EEST), not hardcoded "EET"; player header "Discord server nickname" leftover copy.

## Plan roadmap

1. **Foundation** — scaffold, schema, pure league logic (TDD). `docs/superpowers/plans/2026-10-21-foundation.md`
2. **Shell & auth** — app shell from design, Discord login, sessions, guild/role check.
3. **Season & signup** — create season, signup flow, group draw/lock, schedule generation.
4. **Reporting** — report form, edit-until-flagged, flags, audit log, results webhook.
5. **Standings & pages** — standings, schedule, player page (incl. per-legend record), legends page, archive, audit page.
6. **Admin** — organizer edits, drops, flag resolution, deadline/finalize, tiebreak ranks, weekly pairings post.
7. **Deploy** — Dockerfile, compose with cloudflared, GH Actions → GHCR, backup cron.
8. **Bot API** — service-token JSON endpoints (when bot work starts).

Each plan is written when the previous one lands, against the real code.
