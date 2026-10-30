# Poroleague

League website for the Porobound community's Riftbound TCG league. Players log in with Discord, sign up for a season and report their own matches. Organizers run the season: groups, results, drops and tiebreaks.

- [Rules](docs/rules.md) (shown at `/rules`) · [Spec](docs/spec.md) · [Plans](docs/superpowers/plans/) · [Operations](docs/ops.md) · [Erasure runbook](docs/erasure.md)
- Tracking: [project board](https://github.com/orgs/Porobound/projects/1) and milestones

SvelteKit 3 (adapter-node) · TypeScript · SQLite via Drizzle (better-sqlite3) · Vitest · Playwright. Login is hand-rolled Discord OAuth (`identify guilds.members.read`): only members of one server (`GUILD_ID`) can log in, and the organizer role comes from that server.

## Local setup

> **Use your own Discord test server and application, never the real Porobound ones.** Otherwise your dev site logs in real members and posts test results into Porobound's channels.

Needs **Node 24**.

```sh
npm install
cp .env.example .env    # gitignored; never commit or paste its values
```

**Test server.** Create a server (**+ → Create My Own**). Add a role `Organizer` and give it to yourself (**Roles → Manage Members**): owning the server isn't enough. Turn on **User Settings → Advanced → Developer Mode**, then right-click the server → **Copy Server ID** (`GUILD_ID`) and the role → **Copy Role ID** (`ORGANIZER_ROLE_ID`).

**Application.** At https://discord.com/developers/applications → **New Application** → **OAuth2**: copy **Client ID** (`DISCORD_CLIENT_ID`), **Reset Secret** (`DISCORD_CLIENT_SECRET`, shown once), and add the redirect `http://localhost:5173/auth/callback` exactly (not `127.0.0.1`, no trailing slash).

**Optional:**

- _Webhooks:_ in the test server, **Edit Channel → Integrations → Webhooks → New Webhook**, and paste the whole URL into `WEBHOOK_RESULTS_URL`, `WEBHOOK_ORGANIZERS_URL` or `WEBHOOK_PAIRINGS_URL` (one channel can serve all three).
- _Player role sync_ (signing up gives a Discord role, leaving takes it away): **Bot → Reset Token** (`DISCORD_BOT_TOKEN`); **OAuth2 → URL Generator**, scope `bot`, permission **Manage Roles**, and add the bot to the server; drag the bot's role above the player role and copy its ID (`PLAYER_ROLE_ID`).

Then:

```sh
npm run db:migrate    # creates local.db; rerun after pulling new migrations
npm run dev           # http://localhost:5173
```

Log in with your test-server account. With the role you get an **Admin** link. To start over, delete `local.db` and migrate again.

### Environment variables

Every variable must be present or the app won't start ("Value is missing"). The webhook ones may be empty, and the role-sync ones may be empty or left out. Declare new ones in `src/env.ts` and `.env.example`.

| Variable                                                                  | Purpose                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                                                            | SQLite file path (`local.db`)                            |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`                             | Discord application                                      |
| `DISCORD_REDIRECT_URI`                                                    | OAuth redirect; must match the developer portal exactly  |
| `GUILD_ID`                                                                | Server whose members can log in                          |
| `ORGANIZER_ROLE_ID`                                                       | Role that makes someone an organizer                     |
| `WEBHOOK_RESULTS_URL` / `WEBHOOK_ORGANIZERS_URL` / `WEBHOOK_PAIRINGS_URL` | Results, flags, weekly pairings (empty = off)            |
| `DISCORD_BOT_TOKEN` / `PLAYER_ROLE_ID`                                    | Player role sync (empty = off)                           |
| `DEV_DISCORD_IDS`                                                         | Dev only: real Discord ids for `db:reseed-dev`'s players |
| `ORIGIN` / `TUNNEL_TOKEN` / `IMAGE_TAG`                                   | Servers only, see [Operations](docs/ops.md)              |

### Fake players

Your test server has one real player: you. Use the season's **slug** (from its URL), not its name.

1. **Admin → New season → Open signup**, and sign up yourself.
2. `npm run db:seed-dev -- <slug> [count]` adds fake players (default 24).
3. **Close signup** (draws groups) → **Groups → Lock** (builds the schedule).
4. `npm run db:report-dev -- <match-id> <your-discord-id>` has your opponent report a match, to test flagging. The match id ends the match URL; your Discord id is under right-click yourself → **Copy User ID**.
5. `npm run db:play-dev -- <slug> [share]` plays dev-vs-dev matches (default 0.6 of the schedule; `--drop` drops a dev player). `-- <slug> 1 --finish` plays every match, yours too.

Or `npm run db:reseed-dev -- <your-discord-id>` backs up `local.db` and replaces it with three ready-made seasons (finished, in play, draft), keeping your login.

### Troubleshooting

| Symptom                                       | Fix                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "Value is missing" on start                   | A variable is missing from `.env`. Compare with `.env.example`.                                      |
| "Invalid OAuth2 redirect_uri"                 | `DISCORD_REDIRECT_URI` must match the developer portal exactly.                                      |
| "This account isn't in the Porobound Discord" | Wrong account, or wrong `GUILD_ID`. In dev, "Porobound" means your test server.                      |
| No **Admin** link                             | Missing role or wrong `ORGANIZER_ROLE_ID`. Log out and back in after fixing it.                      |
| Webhooks post nothing                         | Use the full URL and restart `npm run dev`. Errors log as `Discord webhook failed: <status>`.        |
| Data shows up in the wrong place              | Run one `npm run dev` per checkout: dev servers share `.svelte-kit/`, and the second one's env wins. |

## Commands

| Command                                                                | What it does                                  |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| `npm run dev`                                                          | Dev server on :5173                           |
| `npm run check`                                                        | Type-check                                    |
| `npx vitest run` / `npm run test:coverage`                             | Unit tests / with coverage                    |
| `npm run test:e2e`                                                     | Browser tests (see below)                     |
| `npm run build` / `npm run preview`                                    | Production build / serve it locally           |
| `npm run lint` / `npm run format`                                      | Prettier check / fix                          |
| `npm run db:generate` / `npm run db:migrate`                           | Migration from `schema.ts` / apply migrations |
| `npm run db:studio`                                                    | Browse the database                           |
| `npm run db:seed-dev`, `db:report-dev`, `db:play-dev`, `db:reseed-dev` | Dev data, see [Fake players](#fake-players)   |

`npm run test:e2e` builds the app, serves it on :4317 against a throwaway database in your installed Chrome, and leaves `local.db` and `npm run dev` alone. Discord is unreachable during the run, so the `ECONNREFUSED 127.0.0.1:9` lines are expected. Conventions for writing tests are in [`CLAUDE.md`](CLAUDE.md).

## Layout

```
src/lib/league/      pure league rules, unit-tested
src/lib/server/      DB, sessions, Discord calls, webhooks (server-only)
src/lib/components/  Svelte components
src/lib/styles/      design-system CSS snapshot (pb- classes)
src/routes/          pages and endpoints
drizzle/             SQL migrations (commit these)
e2e/                 Playwright tests, seed, fixtures
scripts/             container migrate, host backup, dev data helpers
docs/                rules, spec, plans, runbooks
```

## Contributing

- `main` is protected: open a PR, get one approval, squash or rebase merge.
- CI runs lint, check and unit tests on every PR, plus e2e as its own job. Run `npm run format` before pushing.
- Code and test conventions live in [`CLAUDE.md`](CLAUDE.md).
- Deploys, backups, restores and updating rules or legends: [Operations](docs/ops.md).
