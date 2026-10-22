# Poroleague

Community Riftbound TCG league site. Spec: `docs/spec.md`. Plans: `docs/superpowers/plans/`.

## Stack

SvelteKit (adapter-node) · TypeScript · SQLite via Drizzle (better-sqlite3) · Vitest

## Layout

- `src/lib/league/` — pure league rules (score, round-robin, groups, standings). No DB/framework imports. Unit-tested.
- `src/lib/server/db/schema.ts` — all tables. Change → `npm run db:generate` → commit `drizzle/`.

## Commands

- `npm run dev` — dev server
- `npm run check` — typecheck
- `npx vitest run` — unit tests
- `npm run db:generate` / `npm run db:migrate` — migrations

## Rules

- Dependencies are pinned to exact versions (no `^`/`~`). `.npmrc` sets `save-exact=true`; keep it that way when adding or upgrading.

- League rules stay pure in `src/lib/league/`; routes and the future bot API call them, never reimplement.
- Every result change writes an `audit` row.
- Design from Claude Design HTML: extract tokens into `src/app.css` and components — don't paste raw HTML.
- Import app code as `#lib/<path>.ts` (extension required); there is no `$lib`.
- Env vars: declare in `src/env.ts`, import from `$app/env/private`.
- Styles: `src/lib/styles/porobound.css` is a verbatim design-system snapshot (`pb-` classes); replace it wholesale to re-sync, put app styles in `src/app.css`.
- Auth: `locals.user` is set in `hooks.server.ts`. Admin pages use `organizerPage` and admin actions `organizerAction` (`src/lib/server/auth.ts`): Discord re-check at most once a minute per session, last known role kept on 429. Discord's member endpoint rate-limits hard: never call it per request. Never gate admin work on `locals.user.isOrganizer` alone.
- CSRF origin checks run only in production builds (`npm run build && npm run preview`), never in `npm run dev`; test cross-site POST behaviour there.
