# Weekly Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players only see a week's pairings once an organizer publishes that week. Publishing replaces today's "Post week N pairings" button: one click reveals the week on the site and, when the pairings webhook is set, posts it in Discord.

**Architecture:** One column, `seasons.published_round`: the last round players can see. Locking groups still builds the whole round-robin, but nothing is visible until week 1 is published. A pure rule in `src/lib/league/publish.ts` says which rounds the next publish covers and filters match lists. The public loaders (season page, schedule, season player page, match page) filter on it. Admin pages see everything; organizers can't enter results for unpublished matches.

**Tech Stack:** SvelteKit 3, Svelte 5, Drizzle (better-sqlite3), Vitest.

**Decisions (made in planning, owner can overrule):**

- **Why:** stops players planning counter-picks weeks ahead, and makes each week's pairings an event. Drops are not a concern; there is no re-pairing.
- **Manual publishing**, one week at a time, always the next unpublished week. Organizers may publish ahead of the calendar (e.g. on Sunday for Monday). Automatic by date can come later if manual goes smoothly.
- **No unpublish.** What players have seen can't be unseen; the confirm dialog says so.
- **Store a round, not a week.** `roundsPerWeek` can change mid-season; a stored round never un-publishes anything. The next publish covers from `published_round + 1` to the end of the week that round falls in.
- **Discord is optional.** Publishing works without `WEBHOOK_PAIRINGS_URL`; the post goes out only when it's set. Re-posting an already published week is dropped.
- **No publishing after the deadline** (same as the old post button).
- **Organizers see the public pages as players do** (published only). The full schedule is on Admin → Matches, where unpublished rows show "Unpublished" and no result actions.
- **Total weeks stay visible** ("Week 2 of 7", week tabs). The pairings are hidden, not the season's length.
- **Not filtered:** standings, legends, career pages. They count reported matches only, and unpublished matches can't be reported.
- **No backfill.** The site isn't in use yet, so every season starts at 0 (dropped after Task 2; Steps 3–4 there are superseded). Dev seasons get `published_round` set by hand.
- **Future bot API (Plan 8)** must apply the same filter; the spec says so.

---

## File structure

| File                                                                                                         | Responsibility                                                  |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `src/lib/league/publish.ts` (new), `publish.spec.ts` (new)                                                   | Next rounds to publish; filter a match list to published rounds |
| `src/lib/server/db/schema.ts`, `drizzle/0002_*.sql` (generated + backfill)                                   | `published_round` column                                        |
| `src/lib/server/seasons.ts`                                                                                  | `publishWeek` (update + audit)                                  |
| `src/lib/server/seasonAdmin.ts`                                                                              | `weekPairings` → `nextPairings`                                 |
| `src/lib/server/auditLog.ts`                                                                                 | "Publish" audit line                                            |
| `src/routes/seasons/[slug]/admin/+page.server.ts`, `+page.svelte`                                            | Publish action and button                                       |
| `src/routes/seasons/[slug]/admin/matches/+page.server.ts`, `+page.svelte`, `src/lib/server/resultActions.ts` | Unpublished rows: no edits                                      |
| `src/routes/seasons/[slug]/+page.server.ts`, `+page.svelte`                                                  | Your matches this week: published only, "not out yet" notice    |
| `src/routes/seasons/[slug]/schedule/+page.server.ts`, `+page.svelte`                                         | Published weeks only; empty state for the rest                  |
| `src/routes/seasons/[slug]/players/[id]/+page.server.ts`                                                     | Published matches only                                          |
| `src/routes/seasons/[slug]/matches/[id]/+page.server.ts`                                                     | 404 for unpublished matches                                     |
| `scripts/play-dev.ts`, `scripts/mobile-check.ts`                                                             | Dev scripts only touch published matches                        |
| `docs/spec.md`, `README.md`                                                                                  | Spec and status                                                 |

---

### Task 1: Pure publish rule

**Files:**

- Create: `src/lib/league/publish.ts`
- Test: `src/lib/league/publish.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { nextPublish, published } from './publish';

describe('nextPublish', () => {
	it('starts with week 1', () => {
		expect(nextPublish(0, 2, 7)).toEqual({ week: 1, rounds: [1, 2] });
	});
	it('moves on a week at a time', () => {
		expect(nextPublish(2, 2, 7)).toEqual({ week: 2, rounds: [3, 4] });
	});
	it('stops at the last round', () => {
		expect(nextPublish(6, 2, 7)).toEqual({ week: 4, rounds: [7, 7] });
		expect(nextPublish(7, 2, 7)).toBeNull();
	});
	it('finishes a week left half published after roundsPerWeek changed', () => {
		expect(nextPublish(3, 2, 7)).toEqual({ week: 2, rounds: [4, 4] });
	});
	it('has nothing to publish without matches', () => {
		expect(nextPublish(0, 2, 0)).toBeNull();
	});
});

describe('published', () => {
	it('keeps rounds up to the published one', () => {
		const ms = [{ round: 1 }, { round: 2 }, { round: 3 }];
		expect(published(ms, 2)).toEqual([{ round: 1 }, { round: 2 }]);
		expect(published(ms, 0)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/league/publish.spec.ts`
Expected: FAIL, cannot resolve `./publish`.

- [ ] **Step 3: Implement**

```ts
import { weekOf } from './time';

// The next publish covers from the round after the last published one to the end of its week.
export function nextPublish(publishedRound: number, roundsPerWeek: number, maxRound: number) {
	const first = publishedRound + 1;
	if (first > maxRound) return null;
	const week = weekOf(first, roundsPerWeek);
	return { week, rounds: [first, Math.min(week * roundsPerWeek, maxRound)] as [number, number] };
}

// Players only see matches of published rounds.
export const published = <T extends { round: number }>(ms: T[], publishedRound: number) =>
	ms.filter((m) => m.round <= publishedRound);
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/league/publish.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/league/publish.ts src/lib/league/publish.spec.ts
git commit -m "feat(league): next week to publish"
```

---

### Task 2: `published_round` column with backfill

**Files:**

- Modify: `src/lib/server/db/schema.ts` (seasons table, after `roundsPerWeek`)
- Create: `drizzle/0002_*.sql` (generated), `drizzle/meta/*` (generated)

- [ ] **Step 1: Add the column**

In `seasons`, after `roundsPerWeek`:

```ts
	publishedRound: integer('published_round').notNull().default(0), // players see rounds up to this
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0002_<name>.sql` containing `ALTER TABLE \`seasons\` ADD \`published_round\` integer DEFAULT 0 NOT NULL;`

- [ ] **Step 3: Append the backfill to that file**

```sql
--> statement-breakpoint
UPDATE `seasons` SET `published_round` = COALESCE((SELECT MAX(`round`) FROM `matches` WHERE `matches`.`season_id` = `seasons`.`id`), 0);
```

Seasons that already have a schedule stay fully visible; new ones start at 0.

- [ ] **Step 4: Migrate the dev database and check it**

Run: `npm run db:migrate`, then
`node -e "const D=require('better-sqlite3');const db=new D('local.db');console.log(db.prepare('select slug,status,published_round from seasons').all())"`
Expected: play/finished seasons show their last round, others 0. (Use the path from `DATABASE_URL` in `.env` if it isn't `local.db`.)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run check` → 0 errors.

```bash
git add src/lib/server/db/schema.ts drizzle/
git commit -m "feat(db): seasons.published_round"
```

---

### Task 3: Publish action replaces the pairings post

**Files:**

- Modify: `src/lib/server/seasonAdmin.ts` (`weekPairings`)
- Modify: `src/lib/server/seasons.ts` (add `publishWeek`)
- Modify: `src/lib/server/auditLog.ts`
- Modify: `src/routes/seasons/[slug]/admin/+page.server.ts`, `+page.svelte`

- [ ] **Step 1: `weekPairings` → `nextPairings`**

In `src/lib/server/seasonAdmin.ts`, replace `weekPairings` (and its comment) with the following, and change the imports to `import { reportingClosed } from '#lib/league/time.ts';` plus `import { nextPublish } from '#lib/league/publish.ts';`:

```ts
// The next week to publish and its non-void matches by round; null once everything is out or
// reporting closed.
export function nextPairings(season: Season, { all, live }: SeasonData, now = new Date()) {
	if (reportingClosed(season.deadline, now)) return null;
	const next = nextPublish(
		season.publishedRound,
		season.roundsPerWeek,
		Math.max(0, ...all.map((m) => m.round))
	);
	if (!next) return null;
	const [first, last] = next.rounds;
	const byRound = Array.from({ length: last - first + 1 }, (_, i) => first + i)
		.map((round) => ({
			round,
			pairs: live
				.filter((m) => m.round === round)
				.map((m) => ({ group: m.group, p1Id: m.p1Id, p2Id: m.p2Id }))
		}))
		.filter((r) => r.pairs.length);
	return { ...next, byRound, count: byRound.reduce((n, r) => n + r.pairs.length, 0) };
}
```

- [ ] **Step 2: `publishWeek` in `src/lib/server/seasons.ts`**

Next to `finalizeSeason`:

```ts
export function publishWeek(
	seasonId: number,
	week: number,
	rounds: [number, number],
	actorId: string
) {
	db.transaction((tx) => {
		tx.update(seasons).set({ publishedRound: rounds[1] }).where(eq(seasons.id, seasonId)).run();
		tx.insert(audit)
			.values({ seasonId, actorId, action: 'publish', after: { week, rounds } })
			.run();
	});
}
```

- [ ] **Step 3: Audit line**

In `src/lib/server/auditLog.ts`: add `week?: number; rounds?: [number, number];` to `Change`, `publish: 'Publish'` to `LABEL`, and in the `what` list, after the `finalize` entry:

```ts
r.action === 'publish' && after?.rounds
	? `Week ${after.week} published · R${after.rounds[0]}${after.rounds[1] > after.rounds[0] ? `–${after.rounds[1]}` : ''}`
	: '';
```

- [ ] **Step 4: Admin action and load**

In `src/routes/seasons/[slug]/admin/+page.server.ts`:

- import `nextPairings` instead of `weekPairings`, `publishWeek` from `#lib/server/seasons.ts` and `weekOf` from `#lib/league/time.ts`;
- in `load`, replace `pairings:` with:

```ts
		pairings: season.status === 'play' ? nextPairings(season, d) : null,
		publishedWeeks: weekOf(season.publishedRound, season.roundsPerWeek),
		discord: pairingsEnabled(),
```

- replace the `postPairings` action with:

```ts
publish: async (event) => {
	const user = await organizerAction(event);
	const week = Number((await event.request.formData()).get('week'));
	const season = getSeason(event.params.slug, user);
	if (season.status !== 'play') return fail(409, { message: 'The season is not in play.' });
	const p = nextPairings(season, seasonData(season.id));
	// The form names its week, so a double submit can't publish the week after too.
	if (!p || p.week !== week)
		return fail(409, { message: 'That week is already published, or nothing is left to publish.' });
	publishWeek(season.id, p.week, p.rounds, user.id);
	const discord = pairingsEnabled() && p.count > 0;
	if (discord)
		postPairings(
			pairingsPost(
				`${season.name} · Week ${p.week}`,
				`${event.url.origin}/seasons/${season.slug}/schedule`,
				p.byRound
			)
		);
	return { message: `Week ${p.week} published${discord ? ' and posted in Discord' : ''}.` };
};
```

- [ ] **Step 5: Button**

In `src/routes/seasons/[slug]/admin/+page.svelte`, replace the `ConfirmButton` block (lines 35–49) with:

```svelte
{#if data.pairings}
	{@const p = data.pairings}
	<ConfirmButton
		action="?/publish"
		variant="secondary"
		label="Publish week {p.week}"
		title="Publish week {p.week} pairings?"
		confirmLabel="Publish"
		fields={{ week: String(p.week) }}
	>
		Players see the {p.count} pairings for {p.rounds[0] === p.rounds[1]
			? `round ${p.rounds[0]}`
			: `rounds ${p.rounds[0]}–${p.rounds[1]}`} on the site{data.discord
			? ", and they're posted in the pairings channel with each player's Discord name. Nobody is pinged"
			: ''}. A published week can't be hidden again.
	</ConfirmButton>
{/if}
```

and under `<PhaseBar phases={data.phases} />`, for a season in play:

```svelte
{#if season.status === 'play'}
	<p class="muted">
		{data.publishedWeeks
			? `Players see ${data.publishedWeeks === 1 ? 'week 1' : `weeks 1–${data.publishedWeeks}`} of ${data.weeks}.`
			: 'No weeks published yet. Players see no pairings until you publish week 1.'}
	</p>
{/if}
```

- [ ] **Step 6: Check and commit**

Run: `npm run check` → 0 errors; `npx vitest run` → all pass.

```bash
git add src/lib/server/seasonAdmin.ts src/lib/server/seasons.ts src/lib/server/auditLog.ts "src/routes/seasons/[slug]/admin/+page.server.ts" "src/routes/seasons/[slug]/admin/+page.svelte"
git commit -m "feat(admin): publish week replaces post pairings"
```

---

### Task 4: Public pages show published weeks only

**Files:**

- Modify: `src/routes/seasons/[slug]/matches/[id]/+page.server.ts` (`context`)
- Modify: `src/routes/seasons/[slug]/schedule/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/seasons/[slug]/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/seasons/[slug]/players/[id]/+page.server.ts`

- [ ] **Step 1: Match page 404s unpublished matches**

In `context()`:

```ts
// Unpublished pairings stay secret, organizers included; they have Admin → Matches.
if (!match || match.round > season.publishedRound) error(404, 'Match not found');
```

This also blocks reporting and flagging them, since both actions go through `context()`.

- [ ] **Step 2: Schedule**

In the schedule loader, import `published` from `#lib/league/publish.ts`. Keep `all` (total weeks come from it) and filter the cards:

```ts
	const shownWeeks = weekOf(season.publishedRound, rpw);
	const week = Math.min(
		weeks,
		Math.max(1, Number.isInteger(asked) && asked > 0 ? asked : Math.min(ctx.week, shownWeeks))
	);
	...
	const cards = published(all, season.publishedRound)
		.filter((m) => !group || m.group === group)
		.map((m) => ({ m, card: matchCard(m, ctx) }));
```

and return `published: shownWeeks`. In `+page.svelte`, before `{#each shown as s (s.title)}`:

```svelte
{#if data.week > data.published}
	<p class="empty">Week {data.week} pairings aren't out yet. They're posted week by week.</p>
{:else}
	...existing {#each shown}...{:else}...{/each}
{/if}
```

- [ ] **Step 3: Season page**

In `src/routes/seasons/[slug]/+page.server.ts`, import `published` and:

```ts
const mine =
	me && scheduled ? published(playerMatches(season.id, me.playerId), season.publishedRound) : [];
```

In `myByes`, add `r <= season.publishedRound &&` to the filter, and return:

```ts
		// This week has rounds players can't see yet.
		pending: !!rounds && rounds[1] > season.publishedRound,
```

In `+page.svelte`, inside "Your matches this week", replace `{:else if !data.myByes.length}` with:

```svelte
			{:else if data.pending}
				<p class="empty">This week's pairings aren't out yet. Watch the pairings channel.</p>
			{:else if !data.myByes.length}
```

and `allDone` must not claim "All done" while the week is pending: `!data.pending && data.myWeek.length > 0 && ...`.
In the hero, change the `data.week < 1` lede to: `Pairings come out week by week. Week 1 opens on the start date.`

- [ ] **Step 4: Season player page**

In `src/routes/seasons/[slug]/players/[id]/+page.server.ts`:

```ts
const ms = published(playerMatches(season.id, player.playerId), season.publishedRound);
```

- [ ] **Step 5: Check, test, commit**

Run: `npm run check` → 0 errors; `npx vitest run` → all pass.

```bash
git add "src/routes/seasons/[slug]"
git commit -m "feat: players see published weeks only"
```

---

### Task 5: Organizers can't enter results for unpublished matches

**Files:**

- Modify: `src/lib/server/resultActions.ts` (`editResult`)
- Modify: `src/routes/seasons/[slug]/admin/matches/+page.server.ts`, `+page.svelte`

- [ ] **Step 1: Server guard**

In `editResult`, after the void check:

```ts
if (match.round > season.publishedRound)
	return fail(409, { message: 'Publish this week before entering results.' });
```

- [ ] **Step 2: Matches page**

Loader: return `publishedRound: season.publishedRound` too. Template, line 92:

```svelte
									{#if data.canEdit && r.status !== 'void' && r.round <= data.publishedRound}
										<ResultActions row={r} query="status={data.filter}" />
									{:else if r.round > data.publishedRound}
										<span class="muted small">Unpublished</span>
```

(keep the existing `{/if}`).

- [ ] **Step 3: Check and commit**

Run: `npm run check` → 0 errors.

```bash
git add src/lib/server/resultActions.ts "src/routes/seasons/[slug]/admin/matches"
git commit -m "feat(admin): no results for unpublished matches"
```

---

### Task 6: Dev scripts, docs, smoke test

**Files:**

- Modify: `scripts/play-dev.ts`, `scripts/mobile-check.ts`
- Modify: `docs/spec.md`, `README.md`

- [ ] **Step 1: Dev scripts touch published matches only**

`scripts/play-dev.ts` line 45 query: add `and round <= (select published_round from seasons where id = matches.season_id)`. `scripts/mobile-check.ts` line 41 query: same condition, so it doesn't open 404 pages.

- [ ] **Step 2: Spec**

`docs/spec.md`:

- line 56 (Play row): "post week pairings to Discord" → "publish the next week (players see it; posted to Discord when the webhook is set)".
- line 82: the pairings bullet becomes: "pairings channel: posted by "Publish week N" in admin (all rounds of that week) when `WEBHOOK_PAIRINGS_URL` is set: one message, an embed per round, …".
- Add under the scheduling rules: "Weeks are published one at a time by an organizer (`seasons.published_round`). Players, organizers on public pages and the bot API see only published rounds; Admin → Matches shows all. Published weeks can't be hidden again. No results for unpublished matches."
- line 127: "weekly pairings post" → "weekly publishing".

`README.md` status table: add a row for this plan.

- [ ] **Step 3: Full check**

Run: `npm run check && npx vitest run && npm run lint`
Expected: 0 errors, all tests pass, prettier clean (run `npm run format` on touched files if not).

- [ ] **Step 4: Smoke test (owner's :5173, not a second dev server)**

On a season in play with `published_round = 0` (lock groups on a fresh dev season):

1. As a player: season page says pairings aren't out; the schedule's week 1 shows the empty state; `/seasons/<slug>/matches/<id>` of a round-1 match is 404.
2. As an organizer: Admin shows "No weeks published yet" and "Publish week 1"; Admin → Matches shows "Unpublished" rows.
3. Publish week 1: message "Week 1 published…", the audit log shows "Week 1 published · R1–2", the player sees week 1 cards and can open/report them; week 2 is still the empty state.
4. Resubmit the old week-1 form (browser back + confirm): 409 "already published".

- [ ] **Step 5: Commit**

```bash
git add scripts docs README.md
git commit -m "docs: weekly publishing"
```
