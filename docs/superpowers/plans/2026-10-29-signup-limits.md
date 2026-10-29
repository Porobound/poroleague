# Signup Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizers set max players and group size per season (draft + signup); players see the cap, projected groups and season length on the signup page; Admin → Players lists signups in signup order.

**Architecture:** Two NOT NULL columns on `seasons` (defaults 128 / 16) join the existing `SeasonFields` machinery (parse, editable-per-status, audited `updateSeason`). Pure limits math lives in `src/lib/league/groups.ts`; signup-page copy in `src/lib/season.ts`. Spec: `docs/spec.md` → "Signup limits". Design: Claude Design boards `Signup`, `MobileSignup`, `AdminSeasonNew`, `AdminSeasonEdit`, `AdminPlayers`.

**Tech Stack:** SvelteKit, Drizzle + better-sqlite3, Vitest, Playwright.

**Design deviations (spec wins):** weeks = `weekOf(roundCount(largest group), roundsPerWeek)` (design hardcodes 2/week and even groups); rounds tile keeps the season's rounds per week and start date; the save dialog keeps its single line ("Players see the changes right away.") instead of per-change lines.

---

### Task 1: Limits math (`groups.ts`)

**Files:** Modify `src/lib/league/groups.ts`, `src/lib/league/groups.spec.ts`

- [ ] Tests first: replace the `defaultGroupCount` describe and add `groupPlan` / `maxPlayersFor`:

```ts
import { DEFAULT_GROUP_SIZE, defaultGroupCount, groupPlan, MAX_PLAYERS, maxPlayersFor, splitGroups } from './groups';

describe('defaultGroupCount', () => {
	it('fewest groups of at most the group size', () => {
		for (const [players, size, groups] of [
			[0, 16, 1], [2, 16, 1], [16, 16, 1], [17, 16, 2], [33, 16, 3], [MAX_PLAYERS, 16, 8],
			[13, 12, 2], [32, 32, 1], [33, 32, 2], [48, 6, 8]
		])
			expect(defaultGroupCount(players, size), `${players} at ${size}`).toBe(groups);
		expect(defaultGroupCount(17)).toBe(defaultGroupCount(17, DEFAULT_GROUP_SIZE));
	});
});

describe('groupPlan', () => {
	it('gives the group count and smallest/largest group', () => {
		expect(groupPlan(23, 12)).toEqual({ count: 2, min: 11, max: 12 });
		expect(groupPlan(24, 12)).toEqual({ count: 2, min: 12, max: 12 });
		expect(groupPlan(0, 12)).toEqual({ count: 1, min: 0, max: 0 });
	});
});

describe('maxPlayersFor', () => {
	it('is 8 groups of the size, never past 128', () => {
		expect(maxPlayersFor(6)).toBe(48);
		expect(maxPlayersFor(16)).toBe(128);
		expect(maxPlayersFor(32)).toBe(128);
	});
});
```

- [ ] Run `npx vitest run src/lib/league/groups.spec.ts` → FAIL (missing exports).
- [ ] Implement:

```ts
export const MAX_GROUPS = 8;
export const MAX_PLAYERS = 128;
export const DEFAULT_GROUP_SIZE = 16;

// Most players a season can take with groups of `groupSize`.
export const maxPlayersFor = (groupSize: number) => Math.min(MAX_PLAYERS, MAX_GROUPS * groupSize);

// Fewest groups of at most groupSize; splitGroups keeps them within one player of each other.
export function defaultGroupCount(players: number, groupSize = DEFAULT_GROUP_SIZE): number {
	return Math.max(1, Math.ceil(players / groupSize));
}

export function groupPlan(players: number, groupSize: number) {
	const count = defaultGroupCount(players, groupSize);
	return { count, min: Math.floor(players / count), max: Math.ceil(players / count) };
}
```

- [ ] Remove `GROUP_SIZE`; fix `scripts/seed-dev.ts` in Task 6. Run tests → PASS. Commit `Signup limits: per-size group math`.

### Task 2: Schema

**Files:** Modify `src/lib/server/db/schema.ts`; generate `drizzle/`

- [ ] In `seasons`, after `topCutDate`:

```ts
	maxPlayers: integer('max_players').notNull().default(128),
	groupSize: integer('group_size').notNull().default(16),
```

- [ ] `npm run db:generate` → new migration with two `ALTER TABLE seasons ADD ... DEFAULT ... NOT NULL`. `npx vitest run src/lib/server/db` → PASS. Commit `Signup limits: seasons.max_players, group_size`.

### Task 3: Season form fields, validation, audit

**Files:** Modify `src/lib/season.ts`, `src/lib/season.spec.ts`, `src/lib/components/SeasonForm.svelte`, `src/routes/admin/+page.server.ts`, `src/lib/server/seasons.ts` (AUDITED), `src/lib/server/auditLog.ts`, `src/lib/server/seasons.spec.ts`

- [ ] Tests (`season.spec.ts`): add `maxPlayers: '128', groupSize: '16'` to `valid`; expected parsed values gain `maxPlayers: 128, groupSize: 16`; the all-invalid test also sends `maxPlayers: '1', groupSize: '3'` and expects both keys; locked-fields test's `current` gains both and the form sends `maxPlayers: '4'` (ignored in play). New cases:

```ts
	it('bounds the limits: groups 4–32, at most 8 groups and 128 players', () => {
		const errs = (o: Record<string, string>) => {
			const r = parseSeasonForm(form({ ...valid, ...o }), NEW_SEASON, all);
			return r.ok ? {} : r.errors;
		};
		expect(errs({ groupSize: '33' })).toEqual({ groupSize: 'Between 4 and 32.' });
		expect(errs({ maxPlayers: '129', groupSize: '32' })).toEqual({ maxPlayers: 'Between 2 and 128.' });
		expect(errs({ maxPlayers: '49', groupSize: '6' })).toEqual({
			maxPlayers: 'With groups of up to 6, at most 48 (8 groups).'
		});
		expect(errs({ maxPlayers: '48', groupSize: '6' })).toEqual({});
	});
```

`editableFields` test: `editableFields('signup')` contains `maxPlayers` and `groupSize`; `editableFields('groups')` contains neither.

- [ ] Run → FAIL. Implement in `season.ts`:
  - `SeasonFields` gains `maxPlayers: number; groupSize: number`; `FIELDS` appends both; `NEW_SEASON` gets `maxPlayers: MAX_PLAYERS, groupSize: DEFAULT_GROUP_SIZE`.
  - `EDITABLE.signup` appends `'maxPlayers', 'groupSize'` (draft already = `FIELDS`).
  - `seasonFields` input type and output gain `maxPlayers`, `groupSize` (straight copy).
  - In `parseSeasonForm`:

```ts
	const groupSize = int(raw.groupSize, 4, 32);
	if (groupSize === null) errors.groupSize = 'Between 4 and 32.';
	let maxPlayers = int(raw.maxPlayers, 2, MAX_PLAYERS);
	if (maxPlayers === null) errors.maxPlayers = `Between 2 and ${MAX_PLAYERS}.`;
	else if (groupSize !== null && maxPlayers > maxPlayersFor(groupSize)) {
		errors.maxPlayers = `With groups of up to ${groupSize}, at most ${maxPlayersFor(groupSize)} (${MAX_GROUPS} groups).`;
		maxPlayers = null;
	}
```

  and include both in the null check and the returned values.
- [ ] `routes/admin/+page.server.ts` slug-taken branch: `raw: Object.fromEntries(Object.entries(parsed.values).map(([k, v]) => [k, String(v)]))`.
- [ ] `SeasonForm.svelte`: fields become `$derived` so the max hint follows the current group size; add both fields after `topCutSize`, plus a `lockedHint` shown when locked:

```ts
		{ name: 'maxPlayers', label: 'Max players', type: 'number', min: 2, max: MAX_PLAYERS,
			hint: `Up to ${maxPlayersFor(gs)}. With groups of ${gs}, up to ${MAX_GROUPS} groups.`,
			lockedHint: 'Locked once groups are drawn.' },
		{ name: 'groupSize', label: 'Players per group', type: 'number', min: 4, max: 32,
			lockedHint: 'Locked once groups are drawn.' }
```

where `gs = Number(values.groupSize) || DEFAULT_GROUP_SIZE`; markup: `{:else if locked && f.lockedHint && editable.length}<span class="pb-hint">{f.lockedHint}</span>`.
- [ ] Audit: `AUDITED` appends `'maxPlayers', 'groupSize'`; `auditLog.ts` `Change` gains `maxPlayers?: number; groupSize?: number`, settings gain `['maxPlayers', 'Max players', String]`, `['groupSize', 'Group size', String]`. Test in `seasons.spec.ts` auditLines: a second `updateSeason` with `maxPlayers: 32, groupSize: 12` → line `'Max players 128 → 32 · Group size 16 → 12'`.
- [ ] Lock note in `admin/season/+page.svelte` (play): "Groups are locked, so slug, start date, rounds per week and player limits can't change."
- [ ] `npx vitest run` + `npm run check` → PASS. Commit `Signup limits: season form fields`.

### Task 4: Enforce the limits (save, join, draw)

**Files:** Modify `src/routes/seasons/[slug]/admin/season/+page.server.ts`, `src/routes/seasons/[slug]/+page.server.ts`, `src/lib/server/seasons.ts` (`drawGroups`), `src/routes/seasons/[slug]/admin/groups/+page.server.ts`, `src/lib/server/actions.spec.ts`, `src/lib/server/seasons.spec.ts`

- [ ] Tests (`actions.spec.ts`):
  - Replace "takes MAX_PLAYERS…" with "takes the season's max, then is full until someone withdraws": `setSeason({ status: 'signup', maxPlayers: 4 })`, p1–p3 in, f1 joins (in), `late` gets 409 `Season is full.`, p1 withdraws, `late` joins.
  - "a lower max can't go under the signups": signup season with p1–p3; save `{ name, startDate, roundsPerWeek, deadline, topCutSize, maxPlayers: '2', groupSize: '16' }` → 400 `errors.maxPlayers === '3 already signed up. Remove players or set 3 or more.'`, DB unchanged; `maxPlayers: '3'` → `{ saved: true }`.
  - `seasons.spec.ts`: `drawGroups` with 9 entries and `groupSize: 4` → 3 groups (sizes 3,3,3).
- [ ] Run → FAIL. Implement:
  - season save, after `slugTaken`:

```ts
		const signed = seasonEntries(season.id).length;
		if (parsed.values.maxPlayers !== season.maxPlayers && parsed.values.maxPlayers < signed)
			return fail(400, {
				errors: { maxPlayers: `${signed} already signed up. Remove players or set ${signed} or more.` },
				raw: null
			});
```

  - `drawGroups(seasonId: number, groupSize: number)` → `splitGroups(ids, defaultGroupCount(ids.length, groupSize))`; callers pass `season.groupSize`.
  - season page: `full` and `join` use `season.maxPlayers`; drop the `MAX_PLAYERS` import.
- [ ] Run → PASS. Commit `Signup limits: enforce on save, join and draw`.

### Task 5: Signup page

**Files:** Modify `src/lib/season.ts`, `src/lib/season.spec.ts`, `src/routes/seasons/[slug]/+page.svelte`

- [ ] Test:

```ts
describe('signupInfo', () => {
	const s = { maxPlayers: 32, groupSize: 12, roundsPerWeek: 2 };
	it('shows the cap, the projected groups and the rough length', () => {
		expect(signupInfo(23, s)).toEqual({
			count: '23 / 32',
			spots: '9 spots left',
			groups: '23 signed up → 2 groups of 11–12.',
			length: 'About 6 weeks at this size.'
		});
		expect(signupInfo(31, s).spots).toBe('1 spot left');
		expect(signupInfo(32, s).spots).toBe('No spots left');
		expect(signupInfo(5, { ...s, roundsPerWeek: 1 }).length).toBe('About 5 weeks at this size.'); // odd: 5 rounds
	});
	it('drops the cap at 128 and the projection before anyone signs up', () => {
		expect(signupInfo(0, { ...s, maxPlayers: 128 })).toEqual({
			count: '0', spots: '', groups: 'Round-robin, random draw.', length: ''
		});
		expect(signupInfo(12, s).groups).toBe('12 signed up → 1 group of 12.');
	});
});
```

- [ ] Run → FAIL. Implement in `season.ts`:

```ts
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// The signup page's cap, projected groups and season length for n signups.
export function signupInfo(n: number, s: { maxPlayers: number; groupSize: number; roundsPerWeek: number }) {
	const capped = s.maxPlayers < MAX_PLAYERS;
	const left = s.maxPlayers - n;
	const plan = groupPlan(n, s.groupSize);
	const weeks = weekOf(roundCount(plan.max), s.roundsPerWeek);
	return {
		count: capped ? `${n} / ${s.maxPlayers}` : `${n}`,
		spots: !capped ? '' : left > 0 ? `${plural(left, 'spot')} left` : 'No spots left',
		groups: n
			? `${n} signed up → ${plural(plan.count, 'group')} of ${plan.min === plan.max ? plan.max : `${plan.min}–${plan.max}`}.`
			: 'Round-robin, random draw.',
		length: weeks ? `About ${plural(weeks, 'week')} at this size.` : ''
	};
}
```

  (`plural(2,'group') + ' of'` reads "2 groups of"; keep.)
- [ ] Page: `const info = $derived(signupInfo(data.entries.length, season))`. Tiles: `<strong>Groups of up to {season.groupSize}</strong><span>{info.groups}</span>` and `<strong>{season.roundsPerWeek} rounds a week</strong><span>{info.length} Starts {date(season.startDate)}.</span>`. Panel: `<span class="count">{info.count}</span>{#if info.spots}<span class="muted small">{info.spots}</span>{/if}`. Full copy: `All {season.maxPlayers} spots are taken; one opens if someone withdraws.`
- [ ] Run unit + check → PASS. Commit `Signup limits: signup page shows cap, groups and length`.

### Task 6: Admin → Players in signup order; dev seed

**Files:** Modify `src/lib/server/seasons.ts` (`seasonEntries` adds `joinedAt: entries.createdAt`), `src/routes/seasons/[slug]/admin/players/+page.server.ts`, `.../+page.svelte`, `scripts/seed-dev.ts`, `README.md`, `src/lib/server/pages.spec.ts` or `actions.spec.ts`

- [ ] Test: players page `load` for a signup season with p1–p3 whose `created_at` are set p3 < p1 < p2 returns entries `['p3','p1','p2']`; in play it stays alphabetical. (Use `db.update(entries).set({ createdAt: new Date(...) })`; follow how `pages.spec.ts` calls loads.)
- [ ] Run → FAIL. Implement: in load, `const ordered = scheduled ? list : list.toSorted((a, b) => +a.joinedAt - +b.joinedAt)` (stable, so same-second ties stay alphabetical); map over `ordered`. Svelte list item: leading `<span class="pb-num muted">#{i + 1}</span>` and trailing `<span class="muted small">{when(e.joinedAt)}</span>`; signup intro: 'In signup order. You can remove players while signup is open.'
- [ ] `seed-dev.ts`: select `max_players, group_size` with the season and check against them (`a season takes at most ${max}`, `groups hold at most ${size}`); drop the `groups.ts` import. README line: "default 24, up to the season's max players; groups follow its group size".
- [ ] Run → PASS. Commit `Signup limits: admin players in signup order`.

### Task 7: e2e and docs

**Files:** Modify `e2e/full-season.spec.ts`, `docs/spec.md`

- [ ] Rewrite `e2e/full-season.spec.ts`: seed 5 players, signup season, entries 1–3, organizer. Test 1 (organizer): Admin → Season, fill "Max players" 4 and "Players per group" 4, Save changes (confirm dialog) → "Saved."; fill Max players 2 → error "3 already signed up. Remove players or set 3 or more." Test 2: public page shows "3 / 4", "1 spot left", "Groups of up to 4", "3 signed up → 1 group of 3."; player 4 signs up → "4 / 4"; player 5 sees "Season is full." and no sign-up button. Test 3: Admin → Players shows "#1"…"#4" in signup order.
- [ ] Spec: "Admin → Players lists signups in signup order … until the groups are locked".
- [ ] `npm run test:e2e` → PASS. Commit `Signup limits: e2e`.

### Task 8: Full check

- [ ] `npx vitest run`, `npm run check`, `npm run test:e2e` all green; mutation-check one rule (e.g. drop the below-signups guard → its test fails); push, PR `Closes #N`, watch CI.
