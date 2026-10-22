# Poroleague

League website for the Porobound community's Riftbound TCG league. Players log in with Discord, sign up for a season and report their own matches. Organizers run the season: groups, results, drops and tiebreaks.

- **Rules:** draft in [PR #12](https://github.com/Porobound/poroleague/pull/12) (becomes `docs/rules.md`)
- **Spec:** [`docs/spec.md`](docs/spec.md)
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)
- **Tracking:** [GitHub project](https://github.com/orgs/Porobound/projects/1) and milestones

## Status

| Plan                 | State                                                 |
| -------------------- | ----------------------------------------------------- |
| 1. Foundation        | Done: schema, round robin, groups, standings (tested) |
| 2. Shell & auth      | Done: app shell, Discord login, sessions              |
| 3. Season & signup   | Done: create season, signup, group draw, schedule     |
| 4. Reporting         | Done: report, flag, audit rows, Discord posts         |
| 5. Standings & pages | Next                                                  |
| 6–8                  | Admin, deploy, bot API                                |

## Stack

SvelteKit 3 (adapter-node) · TypeScript · SQLite via Drizzle ORM (better-sqlite3) · Vitest. Login is hand-rolled Discord OAuth (`identify guilds.members.read`). Only members of one Discord server (`GUILD_ID`) can log in, and the organizer role comes from that server.

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

Declare new variables in `src/env.ts` and add them to `.env.example`.

## Commands

| Command                                      | What it does                                           |
| -------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                | Dev server on :5173                                    |
| `npm run check`                              | Type-check (svelte-check)                              |
| `npx vitest run`                             | Unit tests                                             |
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
  routes/              pages and endpoints (auth/ = OAuth, login/ = refusal pages, admin/, seasons/)
  hooks.server.ts      session cookie → locals.user
drizzle/               SQL migrations (commit these)
scripts/               dev-only data helpers
docs/                  spec, plans
```

## Contributing

- `main` is protected: open a PR, get one approval, squash or rebase merge.
- League rules live only in `src/lib/league/`, and routes call them. Every result change writes an audit row.
- See [`CLAUDE.md`](CLAUDE.md) for code conventions (`#lib/…ts` imports, env vars, styling).
