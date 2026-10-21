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

- League rules stay pure in `src/lib/league/`; routes and the future bot API call them, never reimplement.
- Every result change writes an `audit` row.
- Design from Claude Design HTML: extract tokens into `src/app.css` and components — don't paste raw HTML.
