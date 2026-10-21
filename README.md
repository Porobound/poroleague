# Poroleague

League website for the Porobound community's Riftbound TCG league. Players log in with Discord, sign up for a season, and report their own matches. Organizers run the season: groups, results, drops and tiebreaks.

- **Rules:** [`docs/rules.md`](docs/rules.md)
- **Spec:** [`docs/spec.md`](docs/spec.md)
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)
- **Tracking:** [GitHub project](https://github.com/orgs/Porobound/projects/1) and milestones

## Status

| Plan               | State                                                 |
| ------------------ | ----------------------------------------------------- |
| 1. Foundation      | Done: schema, round robin, groups, standings (tested) |
| 2. Shell & auth    | Done: app shell, Discord login, sessions              |
| 3. Season & signup | Next                                                  |
| 4–8                | Reporting, standings & pages, admin, deploy, bot API  |

## Stack

SvelteKit 3 (adapter-node) · TypeScript · SQLite via Drizzle ORM (better-sqlite3) · Vitest. Login is hand-rolled Discord OAuth (`identify guilds.members.read`): only members of the Porobound Discord server can log in, and the organizer role comes from Discord.

## Local setup

Requires Node 24.

1. **Install**

   ```sh
   npm install
   cp .env.example .env
   ```

2. **Discord application** (one-time)
   - Go to https://discord.com/developers/applications, create an application, then open **OAuth2**.
   - Copy the client ID, and reset and copy the client secret.
   - Under **Redirects**, add `http://localhost:5173/auth/callback` and click **Save Changes**.
   - In Discord, turn on Developer Mode (User Settings → Advanced). Then right-click the server → **Copy Server ID**, and right-click the organizer role (Server Settings → Roles) → **Copy Role ID**.
   - Fill these into `.env`. It's gitignored, so never commit it.

3. **Database**

   ```sh
   npm run db:migrate
   ```

   This creates `local.db` (SQLite, gitignored).

4. **Run**

   ```sh
   npm run dev
   ```

   Open http://localhost:5173 and log in with a Discord account that's in the server.

### Environment variables

| Variable                | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `DATABASE_URL`          | SQLite file path (`local.db`)                             |
| `DISCORD_CLIENT_ID`     | Discord application client ID                             |
| `DISCORD_CLIENT_SECRET` | Discord application client secret                         |
| `DISCORD_REDIRECT_URI`  | OAuth redirect, must match the one set in Discord exactly |
| `GUILD_ID`              | Porobound Discord server ID (membership check)            |
| `ORGANIZER_ROLE_ID`     | Discord role that makes someone an organizer              |

All are required when the app starts. Declare new ones in `src/env.ts`.

## Commands

| Command                                      | What it does                                           |
| -------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                | Dev server on :5173                                    |
| `npm run check`                              | Type-check (svelte-check)                              |
| `npx vitest run`                             | Unit tests                                             |
| `npm run build` / `npm run preview`          | Production build / serve it locally                    |
| `npm run lint` / `npm run format`            | Prettier check / fix                                   |
| `npm run db:generate` / `npm run db:migrate` | Create a migration from `schema.ts` / apply migrations |

CSRF origin checks only run in production builds. Test cross-site POST behaviour with `build` + `preview`, not `dev`.

## Layout

```
src/
  lib/league/          pure league rules (score, round robin, groups, standings), unit-tested
  lib/discord.ts       pure Discord helpers (authorize URL, profile, safe return path)
  lib/server/          DB, sessions, Discord HTTP calls (server-only)
  lib/styles/          design-system CSS snapshot (pb- classes)
  lib/components/      Svelte components
  routes/              pages and endpoints (auth/ = OAuth, login/ = refusal pages)
  hooks.server.ts      session cookie → locals.user
drizzle/               SQL migrations (commit these)
docs/                  rules, spec, plans
```

## Contributing

- `main` is protected: open a PR, get one approval, squash or rebase merge.
- League rules live only in `src/lib/league/`, and routes call them. Every result change writes an audit row.
- See [`CLAUDE.md`](CLAUDE.md) for code conventions (`#lib/…ts` imports, env vars, styling).
