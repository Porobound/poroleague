# Poroleague

Community Riftbound TCG league site. Spec: `docs/spec.md`. Plans: `docs/superpowers/plans/`.

## Stack

SvelteKit (adapter-node) · TypeScript · SQLite via Drizzle (better-sqlite3) · Vitest

## Layout

- `src/lib/league/` — pure league rules (score, round-robin, groups, standings). No DB/framework imports. Unit-tested.
- `src/lib/server/db/schema.ts` — all tables. Change → `npm run db:generate` → commit `drizzle/`.

## Commands

`npm run lint` · `npm run check` · `npx vitest run` · `npm run test:e2e` (throwaway DB on :4317, safe beside `npm run dev`) · `npm run shots` (see Rules) · `npm run db:generate`. Full list and dev-data scripts: README.

Before pushing: `npm run lint` (CI runs `prettier --check`), `npm run check`, `npx vitest run`, and `npm run test:e2e` when pages change.

## Workflow

Plan in `docs/superpowers/plans/` → the plan's tasks replace the issue's checklist → branch → one commit per task, ticking its box → PR. The owner merges.

## Worktrees

Do branch work in a `git worktree` outside the repo, never by switching branches in the main checkout: other sessions and the owner work there. Changes in `git status` you didn't make aren't yours; leave them.

- `svelte-kit sync` writes route types into `node_modules/$app`. In a worktree, make `node_modules` a real dir of per-entry symlinks to the repo's packages (incl. `.bin`), skipping `$app`.
- Never run a second `vite dev` from the main checkout: it rewrites the shared `.svelte-kit/generated/dev/env/` and the owner's :5173 silently switches DB. To serve a worktree, symlink `.env` and `local.db*` into it and run `npx vite dev --port 5173 --strictPort` only when :5173 is free.
- Stacked PRs: before opening one, check whether the base PR merged; if so rebase onto `origin/main` and target `main`. Force-push is blocked, so a rebased, already-pushed branch goes up under a new `type/<issue>-slug` name.
- Cleanup after merge: stop the dev server, `rm` the `.env`/`local.db*` symlinks (never their targets), `git worktree remove`, `git worktree prune`, delete the local branch, `npx svelte-kit sync` in the main repo.

## Naming

Enforced on PRs by `.github/workflows/pr.yml`. PRs squash-merge, so the PR title is the commit on `main`.

- Types: `feat fix docs test refactor chore ci`.
- PR title: `type(scope): summary` — scope optional, lowercase area (`discord`, `leaderboard`); ≤72 chars, no trailing period, no plan numbers.
- Branch: `type/<issue>-slug`, e.g. `fix/112-pairings-names`. Every PR has an issue.
- PR body contains `Closes #<issue>` for the branch's issue.
- Branch commits: same format as the title.
- Issues: plain sentence title, no prefix; type via label (`bug`, `enhancement`, `chore`), set by the issue forms.
- Board (Porobound project 1) holds issues only: add new issues with `gh project item-add 1 --owner Porobound --url <issue>`; never add PRs.
- No IP addresses (LAN included) in issues, PRs, comments or commits: say "the dev server" / "the prod host".

## Rules

- Dependencies are pinned to exact versions (no `^`/`~`). `.npmrc` sets `save-exact=true`; keep it that way when adding or upgrading.
- League rules stay pure in `src/lib/league/`; routes and the future bot API call them, never reimplement.
- Every result change writes an `audit` row.
- Every change ships with tests in the same PR: unit (vitest) for logic and server code, e2e (`e2e/`, Playwright) for pages and flows. Bugfixes get a regression test; break the fix once to see it fail.
- e2e: select by role, label and text, never CSS classes. Each spec seeds its own season and players in `beforeAll` and soft-deletes the season in `afterAll` (`e2e/db.ts`); only one season can be running, and the startup seed adds only the organizer `org`. Log in with `test.use(as(id))` or `browser.newPage(as(id))`. Env comes from `playwright.config.ts`, not `.env`; webhooks post to a listener on :4318, read them with `posts(channel)` (`e2e/fixtures.ts`). `e2e/mobile.spec.ts` fails any page that scrolls sideways at 390 × 844.
- Tests: `src/lib/server/test/setup.ts` mocks `$app/env/private` (in-memory DB, no webhooks) and wipes every table before each test; seed with `src/lib/server/test/seed.ts`. Without the mock, vitest reads the real `.env`.
- Screenshots: `.shots/` holds generated images of the main pages, so a PR's file diff shows before and after; the leading dot lists them first. Any PR that can change how a page looks runs `npm run shots` and commits the result; add a `shots/*.spec.ts` for a state the PR introduces that `shots/pages.spec.ts` doesn't show, seeding its own season and removing it afterwards. Look at every changed image before pushing and list them in the PR body with why; an unexplained change is a bug to fix, not an image to commit. Before starting, run it on a clean `origin/main`: if images change, open a `chore: refresh screenshots` PR first. On a rebase conflict, take either side and rerun. Only the remote agent container generates images, since other machines render differently; a Playwright or browser upgrade regenerates everything in its own PR.
- Design from Claude Design HTML: extract tokens into `src/app.css` and components — don't paste raw HTML.
- Import app code as `#lib/<path>.ts` (extension required); there is no `$lib`.
- Env vars: declare in `src/env.ts`, import from `$app/env/private`.
- Styles: `src/lib/styles/porobound.css` is a verbatim design-system snapshot (`pb-` classes); replace it wholesale to re-sync, put app styles in `src/app.css`.
- Auth: `locals.user` is set in `hooks.server.ts`. Admin pages use `organizerPage` and admin actions `organizerAction` (`src/lib/server/auth.ts`): Discord re-check at most once a minute per session, last known role kept on 429. Discord's member endpoint rate-limits hard: never call it per request. Never gate admin work on `locals.user.isOrganizer` alone.
- Deploys: merging to `main` ships to the dev server; prod moves only via the `promote` workflow (`docs/ops.md`). Never push to `dev` (gone) or retag `:prod` by hand.
- CSRF origin checks run only in production builds (`npm run build && npm run preview`), never in `npm run dev`; test cross-site POST behaviour there.
