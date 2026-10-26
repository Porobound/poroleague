# Up to 8 Groups × 16 Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a season run 1–8 groups of at most 16 players (128-player cap), so it stays ~7.5 weeks at any size (issue #80).

**Architecture:** `defaultGroupCount` becomes `ceil(n / 16)`; `MAX_PLAYERS = 128` lives next to it in `src/lib/league/groups.ts`. The `join` action refuses past the cap and the signup panel shows a full state. The groups page `move` action takes a target group (`to`) instead of assuming "the other one". Schema, `groupName`, `splitGroups`, the season-page group switch and the schedule already handle any count.

**Tech Stack:** SvelteKit · Drizzle (better-sqlite3) · Vitest · Playwright

**Deviation from #80:** `topCutSize` stays **per group** (form label "Top cut per group", cut line at that rank in every group). 8 groups × 4 = 32 already fits under the current 0–16 limit, and "every group sends the same number" holds by construction, so the limit/multiple task is dropped. Only the season-page line changes to say "of each group". Non-power-of-two cuts (e.g. 3 groups × 5 = 15 → 16-slot bracket, 1 bye to the top seed) are #81's to decide.

**Non-organizer check:** the codebase turns away non-organizers with a redirect to `/login/not-organizer`, not a 403. The existing `organizer actions` `it.each` in `actions.spec.ts` covers every action incl. `groups.move`, so no new test is needed for it.

---

## File map

- Modify `src/lib/league/groups.ts` + `groups.spec.ts`: `defaultGroupCount`, `MAX_PLAYERS`.
- Modify `src/routes/seasons/[slug]/+page.server.ts`: `join` cap, `full` in load.
- Modify `src/routes/seasons/[slug]/+page.svelte`: full state in signup panel; top-cut line.
- Modify `src/routes/seasons/[slug]/admin/groups/+page.server.ts` + `+page.svelte`: move with target.
- Modify `src/lib/server/actions.spec.ts`: signup cap, move tests.
- Modify `e2e/fixtures.ts`; create `e2e/full-season.spec.ts`; modify `e2e/season-setup.spec.ts` (top-cut line).
- Modify `docs/rules.md`: season format.

Branch: `plan-14-more-groups`.

---

### Task 1: Group count from 16-player groups, player cap

**Files:**

- Modify: `src/lib/league/groups.ts:1-3`
- Test: `src/lib/league/groups.spec.ts:23-29`

- [ ] **Step 1: Write the failing test** — replace the `defaultGroupCount` describe:

```ts
describe('defaultGroupCount', () => {
	it('groups of at most 16', () => {
		for (const [players, groups] of [
			[0, 1],
			[2, 1],
			[16, 1],
			[17, 2],
			[32, 2],
			[33, 3],
			[MAX_PLAYERS, 8]
		])
			expect(defaultGroupCount(players), `${players} players`).toBe(groups);
	});
});
```

and import `MAX_PLAYERS`: `import { defaultGroupCount, MAX_PLAYERS, splitGroups } from './groups';`

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/league/groups.spec.ts` (33 → 2, MAX_PLAYERS undefined).

- [ ] **Step 3: Implement** — replace lines 1–3 of `groups.ts`:

```ts
export const GROUP_SIZE = 16;
export const MAX_PLAYERS = 8 * GROUP_SIZE;

// Fewest groups of at most GROUP_SIZE; splitGroups keeps them within one player of each other.
export function defaultGroupCount(players: number): number {
	return Math.max(1, Math.ceil(players / GROUP_SIZE));
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/league/groups.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/league/groups.ts src/lib/league/groups.spec.ts
git commit -m "Groups of at most 16, up to 8 groups"
```

---

### Task 2: Signup stops at 128

**Files:**

- Modify: `src/routes/seasons/[slug]/+page.server.ts` (load return, `join` action)
- Modify: `src/routes/seasons/[slug]/+page.svelte:180-210` (signup action bar)
- Test: `src/lib/server/actions.spec.ts` (`player signup` describe)

- [ ] **Step 1: Write the failing test** — add to `describe('player signup')`, and `import { MAX_PLAYERS } from '#lib/league/groups.ts';` at the top:

```ts
it('takes MAX_PLAYERS, then is full until someone withdraws', async () => {
	setSeason({ status: 'signup' });
	const ids = Array.from({ length: MAX_PLAYERS - 3 }, (_, i) => `f${i + 1}`);
	db.insert(players)
		.values(ids.map((id) => ({ id, displayName: id })))
		.run();
	seedEntries(season.id, ids.slice(0, -1)); // p1–p3 plus these: one spot left
	db.insert(players).values({ id: 'late', displayName: 'late' }).run();
	await join(as(ids.at(-1)!));
	expect(entered(ids.at(-1)!)).toBe(1);
	expect((await outcome(join(as('late')))).returned).toMatchObject({
		status: 409,
		data: { message: 'Season is full.' }
	});
	expect(entered('late')).toBe(0);
	await join(as('p1')); // already in: still fine
	await withdraw(as('p1'));
	await join(as('late'));
	expect(entered('late')).toBe(1);
});
```

(`beforeEach` already enters p1–p3: 3 + 124 seeded = 127, the 125th `f` joins as the 128th.)

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/server/actions.spec.ts -t "player signup"` ('late' gets in).

- [ ] **Step 3: Implement the action** — in `+page.server.ts` add `import { MAX_PLAYERS } from '#lib/league/groups.ts';`, then in `join` after the status check:

```ts
const list = seasonEntries(season.id);
if (list.length >= MAX_PLAYERS && !list.some((e) => e.playerId === user.id))
	return fail(409, { message: 'Season is full.' });
addEntry(season.id, user.id);
```

and in `load`'s return, next to `signedUp`:

```ts
		full: season.status === 'signup' && list.length >= MAX_PLAYERS,
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/server/actions.spec.ts -t "player signup"`.

- [ ] **Step 5: Signup panel** — in `+page.svelte` import `import { MAX_PLAYERS } from '#lib/league/groups.ts';` and reorder the `signup-action` branches so a full season offers neither login nor sign-up (signed-up players still see Withdraw):

```svelte
<div class="signup-action action-bar">
	{#if data.signedUp && user}
		<p>
			<span class="pb-badge pb-badge-win">You're in</span> Signed up as
			<strong>{user.displayName}</strong>. You can withdraw until groups are drawn.
		</p>
		<ConfirmButton
			action="?/withdraw"
			variant="secondary"
			label="Withdraw"
			title="Withdraw from {season.name}?"
			confirmLabel="Withdraw"
		>
			You can sign up again while signup is open.
		</ConfirmButton>
	{:else if data.full}
		<p>
			<strong>Season is full.</strong>
			<span class="muted">All {MAX_PLAYERS} spots are taken; one opens if someone withdraws.</span>
		</p>
	{:else if !user}
		<a
			class="pb-btn pb-btn-primary"
			href="/auth/login?returnTo={encodeURIComponent(page.url.pathname)}"
			data-sveltekit-reload>Log in with Discord to sign up</a
		>
	{:else}
		<form method="POST" action="?/join">
			<button class="pb-btn pb-btn-primary">Sign up for {season.name}</button>
		</form>
		<p class="muted small">
			By signing up you agree to the <a href="/rules">rules</a> and the
			<a href="/privacy">privacy notice</a>.
		</p>
	{/if}
</div>
```

- [ ] **Step 6: Typecheck** — `npm run check`, expect 0 errors.

- [ ] **Step 7: e2e** — add `full: 'e2e-full'` to `SEASONS` in `e2e/fixtures.ts`, create `e2e/full-season.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { removeSeason, seedEmptySeason, seedEntries, seedPlayers } from './db.ts';
import { SEASONS, as, player } from './fixtures.ts';

const CAP = 128; // MAX_PLAYERS

test.beforeAll(() => {
	seedPlayers('full', CAP + 1);
	seedEmptySeason('full', 'signup');
	seedEntries('full', 1, CAP);
});
test.afterAll(() => removeSeason('full'));

test('a full season offers no sign-up, logged in or out', async ({ page, browser }) => {
	const late = await browser.newPage(as(player('full', CAP + 1)));
	for (const p of [page, late]) {
		await p.goto(`/seasons/${SEASONS.full}`);
		await expect(p.getByText('Season is full.')).toBeVisible();
		await expect(p.getByRole('button', { name: /^Sign up for/ })).toHaveCount(0);
		await expect(p.getByRole('link', { name: 'Log in with Discord to sign up' })).toHaveCount(0);
	}
});
```

- [ ] **Step 8: Break once** — temporarily change `full:` to `false` in load, run `npm run test:e2e -- full-season`, expect FAIL; restore, run again, expect PASS.

- [ ] **Step 9: Commit**

```bash
git add src/routes/seasons/[slug]/+page.server.ts src/routes/seasons/[slug]/+page.svelte src/lib/server/actions.spec.ts e2e/fixtures.ts e2e/full-season.spec.ts
git commit -m "Cap a season at 128 players"
```

---

### Task 3: Move a player to a chosen group

**Files:**

- Modify: `src/routes/seasons/[slug]/admin/groups/+page.server.ts:27-38` (`move`)
- Modify: `src/routes/seasons/[slug]/admin/groups/+page.svelte:84-94` (move form)
- Test: `src/lib/server/actions.spec.ts` (new describe after `groups`)

- [ ] **Step 1: Write the failing test** — after `describe('groups')`:

```ts
describe('move between groups', () => {
	const move = (playerId: string, to: string) =>
		groupActions.move!(event({ slug: 's1' }, ORG, { playerId, to }));
	const groupOf = (id: string) =>
		db.select().from(entries).where(eq(entries.playerId, id)).get()!.group;

	// Three groups of one: p1 in 1, p2 in 2, p3 in 3.
	beforeEach(() => {
		db.delete(matches).run();
		setSeason({ status: 'groups' });
		db.update(entries).set({ group: 2 }).where(eq(entries.playerId, 'p2')).run();
		db.update(entries).set({ group: 3 }).where(eq(entries.playerId, 'p3')).run();
	});

	it('moves a player to the target group', async () => {
		expect((await outcome(move('p1', '3'))).returned).toEqual({});
		expect(groupOf('p1')).toBe(3);
	});

	it('rejects an unknown target, the own group or a player not in the season', async () => {
		for (const [id, to] of [
			['p1', '4'],
			['p1', '0'],
			['p1', ''],
			['p1', '1.5'],
			['p1', '1'],
			['nobody', '2']
		])
			expect(await status(move(id, to)), `${id} → ${to}`).toBe(400);
		expect(groupOf('p1')).toBe(1);
	});

	it('only while groups are unlocked', async () => {
		setSeason({ status: 'play' });
		expect(await status(move('p1', '2'))).toBe(409);
		expect(groupOf('p1')).toBe(1);
	});
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/server/actions.spec.ts -t "move between groups"` (3 groups → "Nothing to move between").

- [ ] **Step 3: Implement** — replace `move` in `groups/+page.server.ts`:

```ts
	move: async (event) => {
		const season = await inGroupsPhase(event);
		if (!season) return fail(409, { message: 'Groups are locked.' });
		const form = await event.request.formData();
		const list = seasonEntries(season.id);
		const entry = list.find((e) => e.playerId === form.get('playerId'));
		const to = Number(form.get('to'));
		if (!entry || !Number.isInteger(to) || to < 1 || to > groupsOf(list).length || to === entry.group)
			return fail(400, { message: 'Pick another group to move to.' });
		setGroup(season.id, entry.playerId, to);
		return {};
	},
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/server/actions.spec.ts`.

- [ ] **Step 5: Form** — replace the `{#if status === 'groups' && data.groups.length === 2}` block in `groups/+page.svelte`. Two groups keep the one-click "Move to A/B"; more get a plain select:

```svelte
{#if status === 'groups' && data.groups.length > 1}
	<form method="POST" action="?/move" class="action-bar">
		<input type="hidden" name="playerId" value={e.playerId} />
		{#if data.groups.length === 2}
			<input type="hidden" name="to" value={2 - i} />
			<button class="pb-btn pb-btn-ghost pb-btn-sm">Move to {groupName(2 - i).slice(-1)}</button>
		{:else}
			<select class="pb-input pb-select" name="to" aria-label="Move {e.displayName} to">
				{#each data.groups as _, j (j)}
					{#if j !== i}<option value={j + 1}>{groupName(j + 1)}</option>{/if}
				{/each}
			</select>
			<button class="pb-btn pb-btn-ghost pb-btn-sm">Move</button>
		{/if}
	</form>
{/if}
```

- [ ] **Step 6: Check + e2e** — `npm run check`, then `npm run test:e2e -- season-setup` (two-group move still passes: label unchanged, it now posts `to`).

- [ ] **Step 7: Commit**

```bash
git add src/routes/seasons/[slug]/admin/groups src/lib/server/actions.spec.ts
git commit -m "Move a player to any group"
```

---

### Task 4: Top-cut line says "of each group"

**Files:**

- Modify: `src/routes/seasons/[slug]/+page.svelte:262`
- Test: `e2e/season-setup.spec.ts` (end of the test)

- [ ] **Step 1: Write the failing test** — append to the test in `season-setup.spec.ts` (two groups, default top cut 4):

```ts
// The cut is per group.
await organizer.goto(`/seasons/${slug}`);
await expect(organizer.getByText('Top 4 of each group go to the top cut.')).toBeVisible();
```

- [ ] **Step 2: Run, expect FAIL** — `npm run test:e2e -- season-setup`.

- [ ] **Step 3: Implement** — line 262:

```svelte
{#if season.topCutSize}<span class="muted"
		>Top {season.topCutSize}{data.groups.length > 1 ? ' of each group' : ''} go to the top cut.</span
	>{/if}
```

- [ ] **Step 4: Run, expect PASS** — `npm run test:e2e -- season-setup`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/seasons/[slug]/+page.svelte e2e/season-setup.spec.ts
git commit -m "Say the top cut is per group"
```

---

### Task 5: Rules

**Files:**

- Modify: `docs/rules.md:14` (Groups bullet), `:19` (Top cut bullet)

- [ ] **Step 1: Groups bullet** — replace line 14:

```md
- **Groups.** A group has at most 16 players. With up to 16 the season has one group; with more, players are drawn at random into as few groups as fit, up to 8. Groups can be uneven by one (17 players: 9 and 8; 40 players: 14, 13 and 13). A season takes at most 128 players; once it's full, a spot opens only if someone withdraws.
```

- [ ] **Step 2: Top cut bullet** — in line 19, after the two-group cross-seeding sentence, add: `With more groups, seeding is set with the top cut.` (Bracket rules for 3+ groups are #81.)

- [ ] **Step 3: Verify** — `npx vitest run src/lib/rules.spec.ts` and `npm run test:e2e -- rules`, expect PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/rules.md
git commit -m "Rules: up to 8 groups of 16, 128-player cap"
```

---

### Task 6: Full check

- [ ] `npm run check` → 0 errors
- [ ] `npx vitest run` → all pass
- [ ] `npm run test:e2e` → all pass
- [ ] Ask before push + PR (`Closes #80`).
