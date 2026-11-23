# Poroleague

Community Riftbound TCG league site. Spec: `docs/spec.md`.

## Stack

SvelteKit (adapter-node) · TypeScript · SQLite via Drizzle (better-sqlite3) · Vitest · Playwright

## Layout

- `src/lib/league/` — pure league rules (score, round-robin, groups, standings). No DB/framework imports. Unit-tested.
- `src/lib/server/db/schema.ts` — all tables. Change → `npm run db:generate` → commit `drizzle/`.

## Commands

`npm run lint` · `npm run check` · `npx vitest run` · `npm run test:e2e` (throwaway DB on :4317, safe beside `npm run dev`) · `npm run shots` (see Rules) · `npm run db:generate`. Full list and dev-data scripts: README.

Before pushing: `npm run lint` (CI runs `prettier --check`), `npm run check`, `npx vitest run`, and `npm run test:e2e` when pages change. Lint is prettier only; there is no ESLint.

## Workflow

Plan in the issue: the plan's tasks are its checklist → branch → one commit per task, ticking its box → PR. The owner merges, a stack all at once (see Worktrees). Plans are not committed: a decision that outlives the work goes in `docs/spec.md`, in the PR that makes it true.

The issue agent's review step runs `.claude/agents/review-poroleague.md` (auth, input, audit, migrations, accessibility, league rules) next to the generic reviewers.

## Full review

A change to these paths is never a small diff for the pipeline's review, however few lines it touches:

- `drizzle/`, `src/lib/server/db/`: schema and migrations; a bad one loses or corrupts league data.
- `src/lib/server/auth.ts`, `src/lib/server/session.ts`, `src/lib/server/discord.ts`, `src/hooks.server.ts`, `src/routes/auth/`: login, sessions and the organizer check.
- `src/env.ts`: secrets and env config.
- `scripts/`: deploy, the nightly backup and the startup migration run on the dev server and the prod host.

## Worktrees

Do branch work in a `git worktree` outside the repo, never by switching branches in the main checkout: other sessions and the owner work there. Changes in `git status` you didn't make aren't yours; leave them.

- `svelte-kit sync` writes route types into `node_modules/$app`. In a worktree, make `node_modules` a real dir of per-entry symlinks to the repo's packages (incl. `.bin`), skipping `$app`. Run `npm ci` in the main checkout first if its `node_modules` is missing or behind `package.json`: the links point there, and a glob over an empty dir makes a literal `*` link. Do this right after `git worktree add`, before any rebase, `npm` or `npx` call.
- Several branches in one session: one branch per command, and `git status --short` is empty before switching.
- Never run a second `vite dev` from the main checkout: it rewrites the shared `.svelte-kit/generated/dev/env/` and the owner's :5173 silently switches DB. To serve a worktree, symlink `.env` and `local.db*` into it and run `npx vite dev --port 5173 --strictPort` only when :5173 is free.
- Stacks: a feature of more than one PR is a GitHub stacked-PR stack (`gh stack init|add|submit` from the `github/gh-stack` extension, or **Create stack** on the site), reviewed and merged as one. Each PR targets the previous PR's branch, all branches live in this repo (no forks), and nothing merges until all are approved; then the owner merges the whole stack, one squashed commit per PR on `main`. History between the branches must stay linear: a fix to a lower PR is a new commit there, then `gh stack rebase` and `gh stack push` (or **Rebase stack**) as its own push; never `git merge` a lower branch up. A standalone fix or prep PR targets `main` and merges alone. Outside a stack, an already-pushed branch goes back up with `git push --force-with-lease` (only `main` is protected; plain `--force` is denied).
- After a review: fixes are new commits on top of the reviewed ones, never an amend, squash or rebase of them. PRs squash-merge, so branch history never reaches `main`, and a rewritten branch hides what changed since the review. A restack that can't wait is its own push with nothing else in it, announced in a comment.
- Cleanup after merge: stop the dev server, `rm` the `.env`/`local.db*` symlinks (never their targets), `git worktree remove`, `git worktree prune`, delete the local branch, `npx svelte-kit sync` in the main repo.

## Naming

Enforced on PRs by `.github/workflows/pr.yml`. PRs squash-merge, so the PR title is the commit on `main`.

- Types: `feat fix docs test refactor chore ci`.
- PR title: `type(scope): summary` — scope optional, lowercase area (`discord`, `leaderboard`); ≤72 chars, no trailing period, no plan numbers.
- Branch: `type/<ticket>-slug` with the Linear key in lowercase, e.g. `fix/pro-12-pairings-names`, or `agent/<ticket>-slug` for the issue agent; a GitHub number (`fix/112-slug`) still passes for work begun before Linear. Every PR has a ticket.
- PR body contains `Closes PRO-12` (or `Closes #112`) for the branch's ticket.
- Branch commits: same format as the title.
- Tickets: new ones in Linear, team `PRO`, plain sentence title, no prefix. The remaining GitHub issues keep their labels (`bug`, `enhancement`, `chore`) and sit on the Porobound board (project 1), which holds issues only, never PRs.
- No IP addresses (LAN included) in issues, PRs, comments or commits: say "the dev server" / "the prod host".

## Rules

- Dependencies are pinned to exact versions (no `^`/`~`). `.npmrc` sets `save-exact=true`; keep it that way when adding or upgrading.
- League rules stay pure in `src/lib/league/`; routes and the public API call them, never reimplement.
- Every result change writes an `audit` row.
- Every change ships with tests in the same PR: unit (vitest) for logic and server code, e2e (`e2e/`, Playwright) for pages and flows. Bugfixes get a regression test; commit the fix, then break it once to see the test fail and `git checkout` the file back.
- e2e: select by role, label and text, never CSS classes. Each spec seeds its own season and players in `beforeAll` and soft-deletes the season in `afterAll` (`e2e/db.ts`); only one season can be running, and the startup seed adds only the organizer `org`. Log in with `test.use(as(id))` or `browser.newPage(as(id))`. Env comes from `playwright.config.ts`, not `.env`; webhooks post to a listener on :4318, read them with `posts(channel)` (`e2e/fixtures.ts`). `e2e/mobile.spec.ts` fails any page that scrolls sideways at 390 × 844.
- Tests: `src/lib/server/test/setup.ts` mocks `$app/env/private` (in-memory DB, no webhooks) and wipes every table before each test; seed with `src/lib/server/test/seed.ts`. Without the mock, vitest reads the real `.env`.
- Screenshots: `.shots/` holds generated images of the main pages, so a PR's file diff shows before and after; the leading dot lists them first. Any PR that can change how a page looks runs `npm run shots` and commits the result; add a `shots/*.spec.ts` for a state the PR introduces that `shots/pages.spec.ts` doesn't show, seeding its own season and removing it afterwards. `npm run shots` deletes `.shots` first: run `npm run check` before it, and commit `.shots` only when the run ends in "N passed". Never open a page-changing PR with its screenshots pending. Look at every changed image before pushing and list them in the PR body with why; an unexplained change is a bug to fix, not an image to commit. Before starting, run it on a clean `origin/main`: if images change, open a `chore: refresh screenshots` PR first. On a rebase conflict, take either side and rerun. `npm run shots` renders in Playwright's Docker image (`scripts/shots.sh`, needs Docker), so every machine produces the same images; a Playwright upgrade regenerates everything in its own PR.
- A design from Claude Design is a sketch: port what is wanted into the CSS and components — don't paste raw HTML.
- Import app code as `#lib/<path>.ts` (extension required); there is no `$lib`.
- Env vars: declare in `src/env.ts`, import from `$app/env/private`.
- Styles: `src/lib/styles/porobound.css` holds the shared styles (tokens, `pb-` classes) and is the source: change a rule where it is defined, never by overriding it from elsewhere. Page layout and one-off components go in `src/app.css`. There is no outside design system to sync with.
- Auth: `locals.user` is set in `hooks.server.ts`. Admin pages use `organizerPage` and admin actions `organizerAction` (`src/lib/server/auth.ts`): Discord re-check at most once a minute per session, last known role kept on 429. Discord's member endpoint rate-limits hard: never call it per request. Never gate admin work on `locals.user.isOrganizer` alone.
- Deploys: merging to `main` ships to the dev server; prod moves only via the `promote` workflow (`docs/ops.md`). Never push to `dev` (gone) or retag `:prod` by hand.
- CSRF origin checks run only in production builds (`npm run build && npm run preview`), never in `npm run dev`; test cross-site POST behaviour there.
