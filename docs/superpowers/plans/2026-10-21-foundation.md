# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Owner rule:** foundation work commits straight to `main` (owner-approved 2026-10-21); tick the matching box on issue #1 after each task. Later plans use branches + PRs.

**Goal:** Scaffolded SvelteKit repo with the full database schema and tested pure league logic (score validation, round-robin, group split, standings with tiebreakers).

**Architecture:** SvelteKit app (`adapter-node`) with SQLite via Drizzle. League rules live as pure, framework-free functions in `src/lib/league/` so they are unit-testable and reusable by routes and the future bot API. No UI in this plan — design work runs in parallel (see `docs/spec.md` → Visual design).

**Tech Stack:** SvelteKit, TypeScript, Drizzle ORM + drizzle-kit, better-sqlite3, Vitest, Node 24.

**Spec:** `docs/spec.md`

---

## File map

| File                           | Responsibility                                       |
| ------------------------------ | ---------------------------------------------------- |
| `src/lib/server/db/schema.ts`  | All tables (replaces scaffold demo)                  |
| `src/lib/legends.ts`           | Legend list (placeholder names for now)              |
| `src/lib/league/score.ts`      | Valid Bo3 scores, match points                       |
| `src/lib/league/roundRobin.ts` | Circle-method schedule                               |
| `src/lib/league/groups.ts`     | Random group split, default group count              |
| `src/lib/league/standings.ts`  | Standings + tiebreakers + drop voiding + double loss |
| `src/lib/league/*.spec.ts`     | Vitest unit tests, colocated                         |
| `CLAUDE.md`                    | Repo guide for future sessions                       |

---

### Task 1: Scaffold

**Files:**

- Create: whole SvelteKit project in repo root (`docs/` already exists)
- Modify: `.gitignore`

- [x] **Step 1: Init git**

Run: `git init -b main`
Expected: `Initialized empty Git repository in .../poroleague/.git/`

- [x] **Step 2: Scaffold with add-ons**

Run:

```sh
npx sv create . --template minimal --types ts \
  --add prettier vitest="usages:unit" sveltekit-adapter="adapter:node" drizzle="database:sqlite+sqlite:better-sqlite3" \
  --install npm --no-dir-check
```

Expected: project files created, dependencies installed, no errors. If the CLI rejects an option name, run `npx sv create --help` / `npx sv add --help` and use the reported spelling — do not drop the add-on.

- [x] **Step 3: Inspect what the scaffold generated**

Run: `cat package.json drizzle.config.ts src/lib/server/db/index.ts .env vite.config.ts`
Expected: scripts include `check`, `test:unit`, `db:generate`, `db:migrate`; `.env` contains `DATABASE_URL=local.db`; `vite.config.ts` has a vitest project including `src/**/*.{test,spec}.{js,ts}`. Note any deviation before continuing.

- [x] **Step 4: Ignore the database file**

Append to `.gitignore` (if not already present):

```
*.db
*.db-journal
```

- [x] **Step 5: Verify build + typecheck**

Run: `npm run check && npm run build`
Expected: `svelte-check found 0 errors`, build completes.

- [x] **Step 6: Commit**

```sh
git add -A
git commit -m "chore: scaffold SvelteKit with drizzle, vitest, adapter-node"
```

---

### Task 2: Database schema

**Files:**

- Modify (replace contents): `src/lib/server/db/schema.ts`

- [x] **Step 1: Write the schema**

Replace `src/lib/server/db/schema.ts` with:

```ts
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

export const players = sqliteTable('players', {
	id: text('id').primaryKey(), // Discord user id
	displayName: text('display_name').notNull(),
	avatar: text('avatar')
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	playerId: text('player_id')
		.notNull()
		.references(() => players.id),
	accessToken: text('access_token').notNull(),
	isOrganizer: integer('is_organizer', { mode: 'boolean' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const seasons = sqliteTable('seasons', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	status: text('status', { enum: ['draft', 'signup', 'groups', 'play', 'finished'] })
		.notNull()
		.default('draft'),
	startDate: text('start_date'), // ISO date
	roundsPerWeek: integer('rounds_per_week').notNull().default(2),
	deadline: text('deadline'), // ISO date
	topCutSize: integer('top_cut_size'),
	createdAt: createdAt()
});

export const entries = sqliteTable(
	'entries',
	{
		seasonId: integer('season_id')
			.notNull()
			.references(() => seasons.id),
		playerId: text('player_id')
			.notNull()
			.references(() => players.id),
		group: integer('group_no'),
		dropped: integer('dropped', { mode: 'boolean' }).notNull().default(false),
		tiebreak: integer('tiebreak'), // organizer-set rank for unresolved ties, lower first
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.seasonId, t.playerId] })]
);

export const matches = sqliteTable(
	'matches',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		seasonId: integer('season_id')
			.notNull()
			.references(() => seasons.id),
		stage: text('stage', { enum: ['group', 'playoff'] })
			.notNull()
			.default('group'),
		group: integer('group_no'),
		round: integer('round').notNull(),
		p1Id: text('p1_id')
			.notNull()
			.references(() => players.id),
		p2Id: text('p2_id')
			.notNull()
			.references(() => players.id),
		p1Games: integer('p1_games'),
		p2Games: integer('p2_games'),
		p1Legend: text('p1_legend'),
		p2Legend: text('p2_legend'),
		diceWinnerId: text('dice_winner_id').references(() => players.id),
		reportedBy: text('reported_by').references(() => players.id),
		reportedAt: integer('reported_at', { mode: 'timestamp' }),
		flaggedBy: text('flagged_by').references(() => players.id),
		flagReason: text('flag_reason'),
		flagResolvedBy: text('flag_resolved_by').references(() => players.id),
		flagResolvedAt: integer('flag_resolved_at', { mode: 'timestamp' })
	},
	(t) => [index('matches_season_idx').on(t.seasonId)]
);

export const audit = sqliteTable(
	'audit',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		seasonId: integer('season_id')
			.notNull()
			.references(() => seasons.id),
		matchId: integer('match_id').references(() => matches.id),
		actorId: text('actor_id')
			.notNull()
			.references(() => players.id),
		action: text('action').notNull(), // report | edit | flag | resolve | drop | ...
		before: text('before', { mode: 'json' }),
		after: text('after', { mode: 'json' }),
		createdAt: createdAt()
	},
	(t) => [index('audit_season_idx').on(t.seasonId)]
);
```

- [x] **Step 2: Generate migration**

Run: `npm run db:generate`
Expected: new SQL file under `drizzle/` creating 6 tables: `players`, `sessions`, `seasons`, `entries`, `matches`, `audit`.

- [x] **Step 3: Apply migration locally**

Run: `npm run db:migrate && sqlite3 local.db .tables`
Expected output includes: `audit  entries  matches  players  seasons  sessions` (plus `__drizzle_migrations`).

- [x] **Step 4: Typecheck**

Run: `npm run check`
Expected: 0 errors. If `src/lib/server/db/index.ts` or a demo route referenced the removed demo table, delete that reference.

- [x] **Step 5: Legend list config**

Create `src/lib/legends.ts` (placeholder LoL names until the real Riftbound list is supplied):

```ts
// ponytail: placeholder champion names; replace with the real Riftbound legend list
export const LEGENDS = [
	'Ahri',
	'Annie',
	'Ashe',
	'Darius',
	'Draven',
	'Ekko',
	'Ezreal',
	'Fiora',
	'Garen',
	'Irelia',
	'Jax',
	'Jinx',
	"Kai'Sa",
	'Katarina',
	'Leona',
	'Lee Sin',
	'Lux',
	'Master Yi',
	'Miss Fortune',
	'Rumble',
	'Sett',
	'Sivir',
	'Teemo',
	'Thresh',
	'Vi',
	'Viktor',
	'Volibear',
	'Yasuo',
	'Yone',
	'Zed'
] as const;

export type Legend = (typeof LEGENDS)[number];
```

- [x] **Step 6: Commit**

```sh
git add src/lib/server/db/schema.ts src/lib/legends.ts drizzle/
git commit -m "feat(db): league schema and legend list"
```

---

### Task 3: Score rules

**Files:**

- Create: `src/lib/league/score.ts`
- Test: `src/lib/league/score.spec.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { isValidScore, matchPoints } from './score';

describe('isValidScore', () => {
	it('accepts Bo3 results and draws', () => {
		for (const [a, b] of [
			[2, 0],
			[2, 1],
			[1, 1],
			[0, 2],
			[1, 2]
		]) {
			expect(isValidScore(a, b)).toBe(true);
		}
	});
	it('rejects impossible scores', () => {
		for (const [a, b] of [
			[2, 2],
			[3, 0],
			[0, 0],
			[1, 0],
			[-1, 2]
		]) {
			expect(isValidScore(a, b)).toBe(false);
		}
	});
});

describe('matchPoints', () => {
	it('3/0 for a win, 1/1 for a draw', () => {
		expect(matchPoints(2, 1)).toEqual([3, 0]);
		expect(matchPoints(0, 2)).toEqual([0, 3]);
		expect(matchPoints(1, 1)).toEqual([1, 1]);
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/league/score.spec.ts`
Expected: FAIL — cannot resolve `./score`.

- [x] **Step 3: Implement**

```ts
const VALID = new Set(['2-0', '2-1', '1-1', '0-2', '1-2']);

export function isValidScore(a: number, b: number): boolean {
	return VALID.has(`${a}-${b}`);
}

export function matchPoints(a: number, b: number): [number, number] {
	return a > b ? [3, 0] : a < b ? [0, 3] : [1, 1];
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/league/score.spec.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```sh
git add src/lib/league/score.ts src/lib/league/score.spec.ts
git commit -m "feat(league): score validation and match points"
```

---

### Task 4: Round-robin schedule

**Files:**

- Create: `src/lib/league/roundRobin.ts`
- Test: `src/lib/league/roundRobin.spec.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { roundRobin } from './roundRobin';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function assertComplete(n: number) {
	const rounds = roundRobin(ids(n));
	const seen = new Set<string>();
	for (const round of rounds) {
		const inRound = round.flat();
		expect(new Set(inRound).size).toBe(inRound.length); // nobody twice in a round
		for (const pair of round) {
			const key = [...pair].sort().join('-');
			expect(seen.has(key)).toBe(false); // no repeat pairing
			seen.add(key);
		}
	}
	expect(seen.size).toBe((n * (n - 1)) / 2); // everyone meets everyone
	return rounds;
}

describe('roundRobin', () => {
	it('even count: n-1 rounds of n/2 matches', () => {
		const rounds = assertComplete(12);
		expect(rounds).toHaveLength(11);
		expect(rounds.every((r) => r.length === 6)).toBe(true);
	});

	it('odd count: n rounds, one bye per round', () => {
		const rounds = assertComplete(13);
		expect(rounds).toHaveLength(13);
		expect(rounds.every((r) => r.length === 6)).toBe(true);
	});

	it('fewer than two players: no rounds', () => {
		expect(roundRobin([])).toEqual([]);
		expect(roundRobin(['p0'])).toEqual([]);
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/league/roundRobin.spec.ts`
Expected: FAIL — cannot resolve `./roundRobin`.

- [x] **Step 3: Implement**

```ts
export type Pairing = [string, string];

// Circle method: first slot fixed, the rest rotate. Odd counts get a null bye slot.
export function roundRobin(players: string[]): Pairing[][] {
	if (players.length < 2) return [];
	const slots: (string | null)[] = players.length % 2 ? [...players, null] : [...players];
	const n = slots.length;
	const rounds: Pairing[][] = [];
	for (let r = 0; r < n - 1; r++) {
		const round: Pairing[] = [];
		for (let i = 0; i < n / 2; i++) {
			const a = slots[i];
			const b = slots[n - 1 - i];
			if (a !== null && b !== null) round.push([a, b]);
		}
		rounds.push(round);
		slots.splice(1, 0, slots.pop()!);
	}
	return rounds;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/league/roundRobin.spec.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```sh
git add src/lib/league/roundRobin.ts src/lib/league/roundRobin.spec.ts
git commit -m "feat(league): round-robin schedule"
```

---

### Task 5: Group split

**Files:**

- Create: `src/lib/league/groups.ts`
- Test: `src/lib/league/groups.spec.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { defaultGroupCount, splitGroups } from './groups';

const items = Array.from({ length: 25 }, (_, i) => i);

describe('splitGroups', () => {
	it('splits into near-equal groups and keeps everyone', () => {
		const groups = splitGroups(items, 2);
		expect(groups.map((g) => g.length)).toEqual([13, 12]);
		expect(groups.flat().sort((a, b) => a - b)).toEqual(items);
	});

	it('one group holds everyone', () => {
		expect(splitGroups(items, 1)[0]).toHaveLength(25);
	});

	it('is deterministic with an injected random source', () => {
		const rng = () => 0.42;
		expect(splitGroups(items, 2, rng)).toEqual(splitGroups(items, 2, rng));
	});
});

describe('defaultGroupCount', () => {
	it('one group under 16 players, two from 16', () => {
		expect(defaultGroupCount(15)).toBe(1);
		expect(defaultGroupCount(16)).toBe(2);
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/league/groups.spec.ts`
Expected: FAIL — cannot resolve `./groups`.

- [x] **Step 3: Implement**

```ts
export function defaultGroupCount(players: number): number {
	return players >= 16 ? 2 : 1;
}

export function splitGroups<T>(items: T[], groupCount: number, random = Math.random): T[][] {
	const shuffled = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return Array.from({ length: groupCount }, (_, g) =>
		shuffled.filter((_, i) => i % groupCount === g)
	);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/league/groups.spec.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```sh
git add src/lib/league/groups.ts src/lib/league/groups.spec.ts
git commit -m "feat(league): random group split"
```

---

### Task 6: Standings and tiebreakers

Rules (from spec): points (W3/D1/L0) → head-to-head mini-league among tied players → game-win % → organizer `tiebreak` rank (lower first). Matches involving a dropped player are void. Unplayed matches count as a loss for both players once the deadline has passed (0 points). Ties still unresolved after all keys are marked `unresolvedTie` so admin can surface them — only between players who have played (before any results everyone is level, and the UI lists them alphabetically).

**Files:**

- Create: `src/lib/league/standings.ts`
- Test: `src/lib/league/standings.spec.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { standings, type Entry, type MatchResult } from './standings';

const entry = (playerId: string, extra: Partial<Entry> = {}): Entry => ({
	playerId,
	dropped: false,
	tiebreak: null,
	...extra
});
const m = (
	p1: string,
	p1Games: number | null,
	p2Games: number | null,
	p2: string
): MatchResult => ({
	p1,
	p2,
	p1Games,
	p2Games
});
const order = (rows: { playerId: string }[]) => rows.map((r) => r.playerId);

describe('standings', () => {
	it('tallies points, record and game-win %', () => {
		const rows = standings(
			['A', 'B', 'C'].map((id) => entry(id)),
			[m('A', 2, 0, 'B'), m('A', 2, 1, 'C'), m('B', 2, 0, 'C')]
		);
		expect(order(rows)).toEqual(['A', 'B', 'C']);
		expect(rows[0]).toMatchObject({ played: 2, wins: 2, points: 6, gameWins: 4, gameLosses: 1 });
		expect(rows[0].gwp).toBeCloseTo(0.8);
	});

	it('head-to-head beats game-win %', () => {
		// A and B on 6 pts, A has better GW%, but B beat A. C and D on 3 pts, D beat C.
		const rows = standings(
			['A', 'B', 'C', 'D'].map((id) => entry(id)),
			[
				m('B', 2, 1, 'A'),
				m('A', 2, 0, 'C'),
				m('A', 2, 0, 'D'),
				m('C', 2, 1, 'B'),
				m('B', 2, 1, 'D'),
				m('D', 2, 0, 'C')
			]
		);
		expect(order(rows)).toEqual(['B', 'A', 'D', 'C']);
	});

	it('three-way cycle falls through to game-win %', () => {
		// A beat B, B beat C, C beat A: all 3 pts, h2h all equal. GW%: A .6, C .5, B .4
		const rows = standings(
			['A', 'B', 'C'].map((id) => entry(id)),
			[m('A', 2, 0, 'B'), m('B', 2, 1, 'C'), m('C', 2, 1, 'A')]
		);
		expect(order(rows)).toEqual(['A', 'C', 'B']);
		expect(rows.some((r) => r.unresolvedTie)).toBe(false);
	});

	it('voids every match of a dropped player', () => {
		const rows = standings(
			[entry('A'), entry('B'), entry('C', { dropped: true })],
			[m('A', 2, 0, 'C'), m('B', 2, 0, 'C'), m('B', 2, 1, 'A')]
		);
		expect(order(rows)).toEqual(['B', 'A']);
		expect(rows[1]).toMatchObject({ played: 1, points: 0 });
	});

	it('flags unresolved ties, organizer tiebreak resolves them', () => {
		const draw = [m('A', 1, 1, 'B')];
		const tied = standings([entry('A'), entry('B')], draw);
		expect(tied.every((r) => r.unresolvedTie)).toBe(true);

		const ranked = standings([entry('A', { tiebreak: 2 }), entry('B', { tiebreak: 1 })], draw);
		expect(order(ranked)).toEqual(['B', 'A']);
		expect(ranked.some((r) => r.unresolvedTie)).toBe(false);
	});

	it('before any results, nobody is flagged as tied', () => {
		const rows = standings([entry('A'), entry('B'), entry('C')], [m('A', null, null, 'B')]);
		expect(rows.some((r) => r.unresolvedTie)).toBe(false);
	});

	it('unplayed match is a double loss only after the deadline', () => {
		const unplayed = [m('A', null, null, 'B')];
		expect(standings([entry('A'), entry('B')], unplayed)[0]).toMatchObject({
			played: 0,
			losses: 0
		});
		expect(standings([entry('A'), entry('B')], unplayed, true)[0]).toMatchObject({
			played: 1,
			losses: 1,
			points: 0
		});
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/league/standings.spec.ts`
Expected: FAIL — cannot resolve `./standings`.

- [x] **Step 3: Implement**

```ts
import { matchPoints } from './score';

export type Entry = { playerId: string; dropped: boolean; tiebreak: number | null };
export type MatchResult = {
	p1: string;
	p2: string;
	p1Games: number | null;
	p2Games: number | null;
};
export type Row = {
	playerId: string;
	played: number;
	wins: number;
	draws: number;
	losses: number;
	points: number;
	gameWins: number;
	gameLosses: number;
	gwp: number;
	unresolvedTie: boolean;
};

const played = (m: MatchResult): m is MatchResult & { p1Games: number; p2Games: number } =>
	m.p1Games !== null && m.p2Games !== null;

export function standings(entries: Entry[], matches: MatchResult[], deadlinePassed = false): Row[] {
	const active = new Map(entries.filter((e) => !e.dropped).map((e) => [e.playerId, e]));
	const counted = matches.filter((m) => active.has(m.p1) && active.has(m.p2));
	const rows = new Map<string, Row>();
	for (const id of active.keys()) {
		rows.set(id, {
			playerId: id,
			played: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			points: 0,
			gameWins: 0,
			gameLosses: 0,
			gwp: 0,
			unresolvedTie: false
		});
	}

	for (const m of counted) {
		const a = rows.get(m.p1)!;
		const b = rows.get(m.p2)!;
		if (!played(m)) {
			if (deadlinePassed) for (const r of [a, b]) tally(r, 0, 0, 0);
			continue;
		}
		const [pa, pb] = matchPoints(m.p1Games, m.p2Games);
		tally(a, pa, m.p1Games, m.p2Games);
		tally(b, pb, m.p2Games, m.p1Games);
	}
	for (const r of rows.values()) {
		const games = r.gameWins + r.gameLosses;
		r.gwp = games ? r.gameWins / games : 0;
	}

	const byPoints = [...rows.values()].sort((x, y) => y.points - x.points);
	const result: Row[] = [];
	for (let i = 0; i < byPoints.length;) {
		let j = i;
		while (j < byPoints.length && byPoints[j].points === byPoints[i].points) j++;
		result.push(...breakTie(byPoints.slice(i, j), counted, active));
		i = j;
	}
	return result;
}

function tally(r: Row, points: number, won: number, lost: number) {
	r.played++;
	r.points += points;
	r.gameWins += won;
	r.gameLosses += lost;
	if (points === 3) r.wins++;
	else if (points === 1) r.draws++;
	else r.losses++;
}

// ponytail: single-pass mini-league; a still-tied subset isn't re-run through h2h. Recurse if that ever matters.
function breakTie(tied: Row[], matches: MatchResult[], entries: Map<string, Entry>): Row[] {
	if (tied.length === 1) return tied;
	const ids = new Set(tied.map((r) => r.playerId));
	const h2h = new Map(tied.map((r) => [r.playerId, 0]));
	for (const m of matches) {
		if (!played(m) || !ids.has(m.p1) || !ids.has(m.p2)) continue;
		const [pa, pb] = matchPoints(m.p1Games, m.p2Games);
		h2h.set(m.p1, h2h.get(m.p1)! + pa);
		h2h.set(m.p2, h2h.get(m.p2)! + pb);
	}
	const rank = (r: Row) => entries.get(r.playerId)!.tiebreak ?? Number.MAX_SAFE_INTEGER;
	const cmp = (x: Row, y: Row) =>
		h2h.get(y.playerId)! - h2h.get(x.playerId)! || y.gwp - x.gwp || rank(x) - rank(y);

	const sorted = [...tied].sort(cmp);
	for (let i = 0; i < sorted.length - 1; i++) {
		const [x, y] = [sorted[i], sorted[i + 1]];
		if (x.played > 0 && y.played > 0 && cmp(x, y) === 0) {
			x.unresolvedTie = true;
			y.unresolvedTie = true;
		}
	}
	return sorted;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/league/standings.spec.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Commit**

```sh
git add src/lib/league/standings.ts src/lib/league/standings.spec.ts
git commit -m "feat(league): standings with tiebreakers, drops, double losses"
```

---

### Task 7: Repo CLAUDE.md and final verification

**Files:**

- Create: `CLAUDE.md`
- Modify: `/home/mikhe/Projects/claude/CLAUDE.md` (Sub-projects list)

- [ ] **Step 1: Write `CLAUDE.md`**

```markdown
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
```

- [ ] **Step 2: Register sub-project in parent CLAUDE.md**

In `/home/mikhe/Projects/claude/CLAUDE.md`, under `## Sub-projects`, add:

```markdown
- `poroleague/` — Riftbound TCG community league website (SvelteKit + SQLite)
```

- [ ] **Step 3: Full verification**

Run: `npm run check && npx vitest run && npm run build`
Expected: 0 type errors; 4 test files, 17 tests passing; build succeeds.

- [ ] **Step 4: Commit**

```sh
git add CLAUDE.md docs/superpowers/plans/2026-10-21-foundation.md
git commit -m "docs: repo CLAUDE.md, foundation plan complete"
```
