# Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Owner rule:** work on branch `plan-4-reporting`; per-task commits once the owner approves the plan; tick the matching box on issue #4 after each task; ask before push/PR. The PR body starts with `Closes #4`. PRs are never added to the project board.

**Goal:** Players in a running season can report their own matches (score, both legends, dice-roll winner), edit their report until the opponent flags it, and flag a result reported against them; every change writes an audit row and is posted to Discord.

**Architecture:** One match page, `/seasons/[slug]/matches/[id]`, serves every state from the design (report, edit, locked, reported against you, read-only). Which state a viewer gets is a pure function, `matchMode`, in `src/lib/league/report.ts`, next to report-form parsing and the Discord result line; the deadline check lives in `src/lib/league/time.ts`. Both are unit-tested. DB writes live in `src/lib/server/matches.ts`: each change and its audit row go in one transaction. Discord webhooks live in `src/lib/server/webhooks.ts`, fire-and-forget, mentions disabled.

**Tech Stack:** SvelteKit 3 form actions, Drizzle + better-sqlite3 (sync API), Vitest.

**Spec:** `docs/spec.md` → Matches & scoring, Reporting & trust, Discord integration.

**Conventions (from `CLAUDE.md`):** imports are `#lib/<path>.ts`; env from `$app/env/private`, declared in `src/env.ts`; style with `pb-` classes from `src/lib/styles/porobound.css` plus app classes in `src/app.css`; `redirect()`/`error()` throw.

**Decisions made in this plan:**

- Either player can report an unreported match. The first report counts; after that only the reporter edits (until flagged) and only the opponent flags.
- Reporting and editing close at the season deadline (23:59 Helsinki time on the deadline date). **Flagging stays open while the season is in play**, so a report sent at 23:58 can still be disputed. Finalize (Plan 6) ends it.
- A flag locks the result for both players for good, resolved or not (spec: "after a flag, only organizers change the result"; "a resolved result can't be flagged again"). Flag reason is required, up to 500 characters.
- A match is void (no reporting, no flagging) once either player is dropped.
- Organizers report only their own matches here, like any player. Editing other results is Plan 6.
- Audit actions written here: `report`, `edit`, `flag`. `before`/`after` hold the result fields (`p1Games`, `p2Games`, `p1Legend`, `p2Legend`, `diceWinnerId`); a flag stores `{ flagReason }` in `after`. The audit page itself is Plan 5.
- Webhooks: report and edit → results channel (`Alice 2-1 Bob (Jinx vs Ahri, Alice won the roll)`, edits prefixed `Edited:`); flag → organizer channel with reason and link. Empty webhook URL = skip (dev). Every post sends `allowed_mentions: { parse: [] }`: names and flag reasons are user text and must never ping `@everyone` or roles.
- Legend pre-fill: each player's legend from their most recently reported match in any season; else empty.
- Entry point for now: a "Your matches" list on the season page. Plan 5's player page and schedule replace it.
- No `use:enhance`, no toast: same plain-form + inline `.status` pattern as Plan 3. Score buttons are native radios styled as the design's `.opt` chips, so the form works without JS.
- Read-check-write in an action runs synchronously (better-sqlite3 is sync, no `await` in between), so two requests can't interleave inside it. Keep it that way; webhooks are posted after the write, not awaited.

**Changed during execution:** reports are final. The owner pointed out that edit-until-flagged let a reporter quietly change a result after the opponent had seen it. Now neither player edits: either one (the reporter included, for their own mistakes) flags the result to have an organizer fix it. Edit mode and the `Edited:` webhook are gone. The report form confirms before saving (`ConfirmButton` gained `inForm` and `confirmDisabled`), and the dialog shows the result line.

**Not in this plan:** audit log page, schedule, player page (Plan 5); organizer edits, flag resolution, drops, double losses (Plan 6); bot endpoints (Plan 8).

---

## File map

| File                                                                | Responsibility                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/lib/league/time.ts` (+ `.spec.ts`)                             | `LEAGUE_TZ`, league-local date, `reportingClosed`           |
| `src/lib/league/report.ts` (+ `.spec.ts`)                           | Pure: `parseReport`, `matchMode`, `resultLine`              |
| `src/lib/server/matches.ts`                                         | Match queries, last legend, void check, report/flag + audit |
| `src/env.ts`, `.env.example`                                        | + `WEBHOOK_RESULTS_URL`, `WEBHOOK_ORGANIZERS_URL`           |
| `src/lib/server/webhooks.ts`                                        | Discord webhook posts                                       |
| `src/lib/components/MatchCard.svelte`                               | Design's MatchCard (read-only result)                       |
| `src/app.css`                                                       | + `.opt` choice chips, report form layout                   |
| `src/routes/seasons/[slug]/matches/[id]/+page.server.ts`, `.svelte` | Match page: report, edit, flag, locked, view                |
| `src/routes/seasons/[slug]/+page.server.ts`, `+page.svelte`         | + "Your matches" list                                       |
| `scripts/report-dev.ts`, `package.json`                             | Dev-only: report a match as the opponent                    |

---

### Task 1: League time (pure)

**Files:**

- Create: `src/lib/league/time.ts`
- Test: `src/lib/league/time.spec.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/league/time.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { leagueDate, reportingClosed } from './time';

describe('leagueDate', () => {
	it('gives the calendar date in Helsinki', () => {
		expect(leagueDate(new Date('2026-12-20T21:59:00Z'))).toBe('2026-12-20');
		expect(leagueDate(new Date('2026-12-20T22:00:00Z'))).toBe('2026-12-21');
	});
});

describe('reportingClosed', () => {
	it('closes after 23:59 Helsinki time on the deadline date (winter, UTC+2)', () => {
		expect(reportingClosed('2026-12-20', new Date('2026-12-20T21:59:59Z'))).toBe(false);
		expect(reportingClosed('2026-12-20', new Date('2026-12-20T22:00:00Z'))).toBe(true);
	});

	it('follows summer time (UTC+3)', () => {
		expect(reportingClosed('2026-06-10', new Date('2026-06-10T20:59:59Z'))).toBe(false);
		expect(reportingClosed('2026-06-10', new Date('2026-06-10T21:00:00Z'))).toBe(true);
	});

	it('stays open when no deadline is set', () => {
		expect(reportingClosed(null, new Date())).toBe(false);
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/league/time.spec.ts`
Expected: FAIL, cannot resolve `./time`.

- [x] **Step 3: Write minimal implementation**

Create `src/lib/league/time.ts`:

```ts
export const LEAGUE_TZ = 'Europe/Helsinki';

// en-CA formats dates as YYYY-MM-DD, so league dates compare as strings.
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: LEAGUE_TZ });

export const leagueDate = (now: Date) => fmt.format(now);

// The deadline is 23:59 league time on the deadline date: closed once that date is over in Helsinki.
export const reportingClosed = (deadline: string | null, now: Date) =>
	!!deadline && leagueDate(now) > deadline;
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/league/time.spec.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add src/lib/league/time.ts src/lib/league/time.spec.ts
git commit -m "feat(league): league timezone and reporting deadline"
```

---

### Task 2: Report rules (pure)

**Files:**

- Create: `src/lib/league/report.ts`
- Test: `src/lib/league/report.spec.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/league/report.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchMode, parseReport, resultLine, type ModeContext } from './report';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const valid = { p1Games: '2', p2Games: '1', p1Legend: 'Jinx', p2Legend: 'Ahri', dice: 'a' };

describe('parseReport', () => {
	it('parses a valid report', () => {
		expect(parseReport(form(valid), 'a', 'b')).toEqual({
			ok: true,
			values: { p1Games: 2, p2Games: 1, p1Legend: 'Jinx', p2Legend: 'Ahri', diceWinnerId: 'a' }
		});
	});

	it('accepts a 1-1 draw', () => {
		expect(parseReport(form({ ...valid, p1Games: '1', p2Games: '1' }), 'a', 'b').ok).toBe(true);
	});

	it('rejects scores that are not a finished Bo3, and missing scores', () => {
		for (const [p1Games, p2Games] of [
			['2', '2'],
			['0', '0'],
			['1', '0'],
			['3', '0'],
			['', '2']
		]) {
			const r = parseReport(form({ ...valid, p1Games, p2Games }), 'a', 'b');
			expect(r.ok ? null : r.errors).toEqual({
				score: 'That is not a finished Bo3. Check the numbers.'
			});
		}
	});

	it('requires listed legends and a dice winner who played the match', () => {
		const r = parseReport(
			form({ ...valid, p1Legend: 'Not A Legend', p2Legend: '', dice: 'c' }),
			'a',
			'b'
		);
		expect(Object.keys(r.ok ? {} : r.errors).sort()).toEqual(['dice', 'p1Legend', 'p2Legend']);
	});
});

describe('matchMode', () => {
	const unreported = { p1Id: 'a', p2Id: 'b', reportedBy: null, flaggedBy: null };
	const byA = { ...unreported, reportedBy: 'a' };
	const ctx = (o: Partial<ModeContext> = {}): ModeContext => ({
		viewerId: 'a',
		inPlay: true,
		closed: false,
		voided: false,
		...o
	});

	it('lets either player report an unreported match', () => {
		expect(matchMode(unreported, ctx())).toBe('report');
		expect(matchMode(unreported, ctx({ viewerId: 'b' }))).toBe('report');
	});

	it('is read-only for visitors, other players, void matches and seasons not in play', () => {
		expect(matchMode(unreported, ctx({ viewerId: null }))).toBe('view');
		expect(matchMode(unreported, ctx({ viewerId: 'c' }))).toBe('view');
		expect(matchMode(unreported, ctx({ voided: true }))).toBe('view');
		expect(matchMode(byA, ctx({ voided: true, viewerId: 'b' }))).toBe('view');
		expect(matchMode(unreported, ctx({ inPlay: false }))).toBe('view');
	});

	it('lets the reporter edit and the opponent flag', () => {
		expect(matchMode(byA, ctx())).toBe('edit');
		expect(matchMode(byA, ctx({ viewerId: 'b' }))).toBe('flag');
	});

	it('locks the result for both players once flagged', () => {
		const flagged = { ...byA, flaggedBy: 'b' };
		expect(matchMode(flagged, ctx())).toBe('locked');
		expect(matchMode(flagged, ctx({ viewerId: 'b' }))).toBe('locked');
	});

	it('closes reporting and editing at the deadline, but not flagging', () => {
		expect(matchMode(unreported, ctx({ closed: true }))).toBe('view');
		expect(matchMode(byA, ctx({ closed: true }))).toBe('view');
		expect(matchMode(byA, ctx({ closed: true, viewerId: 'b' }))).toBe('flag');
	});
});

describe('resultLine', () => {
	it('reads like the spec example', () => {
		const r = { p1Games: 2, p2Games: 1, p1Legend: 'Jinx', p2Legend: 'Ahri', diceWinnerId: 'a' };
		expect(resultLine({ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, r)).toBe(
			'Alice 2-1 Bob (Jinx vs Ahri, Alice won the roll)'
		);
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/league/report.spec.ts`
Expected: FAIL, cannot resolve `./report`.

- [x] **Step 3: Write minimal implementation**

Create `src/lib/league/report.ts`:

```ts
import { LEGENDS } from '#lib/legends.ts';
import { isValidScore } from './score';

export type Report = {
	p1Games: number;
	p2Games: number;
	p1Legend: string;
	p2Legend: string;
	diceWinnerId: string;
};
export type ReportErrors = Partial<Record<'score' | 'p1Legend' | 'p2Legend' | 'dice', string>>;
export type ReportParse = { ok: true; values: Report } | { ok: false; errors: ReportErrors };

const LEGEND_SET = new Set<string>(LEGENDS);

export function parseReport(form: FormData, p1Id: string, p2Id: string): ReportParse {
	const get = (k: string) => String(form.get(k) ?? '').trim();
	const [g1, g2] = [get('p1Games'), get('p2Games')];
	const p1Games = Number(g1);
	const p2Games = Number(g2);
	const values: Report = {
		p1Games,
		p2Games,
		p1Legend: get('p1Legend'),
		p2Legend: get('p2Legend'),
		diceWinnerId: get('dice')
	};

	const errors: ReportErrors = {};
	if (!g1 || !g2 || !isValidScore(p1Games, p2Games))
		errors.score = 'That is not a finished Bo3. Check the numbers.';
	if (!LEGEND_SET.has(values.p1Legend)) errors.p1Legend = 'Pick a legend.';
	if (!LEGEND_SET.has(values.p2Legend)) errors.p2Legend = 'Pick a legend.';
	if (values.diceWinnerId !== p1Id && values.diceWinnerId !== p2Id)
		errors.dice = 'Pick who won the dice roll.';
	return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

export type MatchMode = 'report' | 'edit' | 'flag' | 'locked' | 'view';
export type ModeMatch = {
	p1Id: string;
	p2Id: string;
	reportedBy: string | null;
	flaggedBy: string | null;
};
export type ModeContext = {
	viewerId: string | null;
	inPlay: boolean;
	closed: boolean; // past the season deadline
	voided: boolean; // a player was dropped
};

// What the viewer may do with a match. Flagging stays open after the deadline so a last-minute
// report can still be disputed; a flag locks the result for good (only organizers change it).
export function matchMode(m: ModeMatch, c: ModeContext): MatchMode {
	const playing = c.viewerId === m.p1Id || c.viewerId === m.p2Id;
	if (!c.viewerId || !playing || !c.inPlay || c.voided) return 'view';
	if (!m.reportedBy) return c.closed ? 'view' : 'report';
	if (m.flaggedBy) return 'locked';
	if (m.reportedBy === c.viewerId) return c.closed ? 'view' : 'edit';
	return 'flag';
}

type Named = { id: string; name: string };

export function resultLine(p1: Named, p2: Named, r: Report): string {
	const dice = r.diceWinnerId === p1.id ? p1.name : p2.name;
	return `${p1.name} ${r.p1Games}-${r.p2Games} ${p2.name} (${r.p1Legend} vs ${r.p2Legend}, ${dice} won the roll)`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/league/report.spec.ts`
Expected: PASS (10 tests). If `#lib/legends.ts` fails to resolve under Vitest, use `'../legends'` and say so in the commit message.

- [x] **Step 5: Run the whole suite and typecheck**

Run: `npx vitest run && npm run check`
Expected: all tests pass, 0 errors.

- [x] **Step 6: Commit**

```bash
git add src/lib/league/report.ts src/lib/league/report.spec.ts
git commit -m "feat(league): report parsing, match modes, result line"
```

---

### Task 3: Match queries and writes

**Files:**

- Create: `src/lib/server/matches.ts`

- [x] **Step 1: Write the module**

Create `src/lib/server/matches.ts`:

```ts
import { and, asc, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { Report } from '#lib/league/report.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, players } from '#lib/server/db/schema.ts';

export type Match = typeof matches.$inferSelect;
export type Player = typeof players.$inferSelect;

export const getMatch = (seasonId: number, id: number) =>
	db
		.select()
		.from(matches)
		.where(and(eq(matches.id, id), eq(matches.seasonId, seasonId)))
		.get();

export function matchPlayers(m: Match): [Player, Player] {
	const list = db
		.select()
		.from(players)
		.where(inArray(players.id, [m.p1Id, m.p2Id]))
		.all();
	const by = (id: string) => list.find((p) => p.id === id)!;
	return [by(m.p1Id), by(m.p2Id)];
}

export const playerMatches = (seasonId: number, playerId: string) =>
	db
		.select()
		.from(matches)
		.where(
			and(
				eq(matches.seasonId, seasonId),
				or(eq(matches.p1Id, playerId), eq(matches.p2Id, playerId))
			)
		)
		.orderBy(asc(matches.round))
		.all();

// A match is void once either player is dropped (spec: Drops).
export const isVoided = (m: Match) =>
	!!db
		.select({ playerId: entries.playerId })
		.from(entries)
		.where(
			and(
				eq(entries.seasonId, m.seasonId),
				inArray(entries.playerId, [m.p1Id, m.p2Id]),
				eq(entries.dropped, true)
			)
		)
		.get();

// Pre-fills the report form: the legend the player last reported with, in any season.
export function lastLegend(playerId: string): string | null {
	const m = db
		.select({ p1Id: matches.p1Id, p1Legend: matches.p1Legend, p2Legend: matches.p2Legend })
		.from(matches)
		.where(
			and(or(eq(matches.p1Id, playerId), eq(matches.p2Id, playerId)), isNotNull(matches.reportedAt))
		)
		.orderBy(desc(matches.reportedAt))
		.limit(1)
		.get();
	if (!m) return null;
	return m.p1Id === playerId ? m.p1Legend : m.p2Legend;
}

const result = (m: Match) => ({
	p1Games: m.p1Games,
	p2Games: m.p2Games,
	p1Legend: m.p1Legend,
	p2Legend: m.p2Legend,
	diceWinnerId: m.diceWinnerId
});

// First report or the reporter's edit; the result and its audit row are written together.
export function saveReport(m: Match, actorId: string, values: Report): 'report' | 'edit' {
	const action = m.reportedBy ? 'edit' : 'report';
	db.transaction((tx) => {
		tx.update(matches)
			.set({ ...values, reportedBy: m.reportedBy ?? actorId, reportedAt: new Date() })
			.where(eq(matches.id, m.id))
			.run();
		tx.insert(audit)
			.values({
				seasonId: m.seasonId,
				matchId: m.id,
				actorId,
				action,
				before: m.reportedBy ? result(m) : null,
				after: values
			})
			.run();
	});
	return action;
}

export function flagMatch(m: Match, actorId: string, reason: string) {
	db.transaction((tx) => {
		tx.update(matches)
			.set({ flaggedBy: actorId, flagReason: reason })
			.where(eq(matches.id, m.id))
			.run();
		tx.insert(audit)
			.values({
				seasonId: m.seasonId,
				matchId: m.id,
				actorId,
				action: 'flag',
				before: null,
				after: { flagReason: reason }
			})
			.run();
	});
}
```

- [x] **Step 2: Typecheck**

Run: `npm run check`
Expected: 0 errors. (No unit test: this module is thin DB access; the spec keeps Vitest on pure logic. It is exercised in Task 7.)

- [x] **Step 3: Commit**

```bash
git add src/lib/server/matches.ts
git commit -m "feat(server): match queries, report and flag writes with audit"
```

---

### Task 4: Discord webhooks

**Files:**

- Modify: `src/env.ts`
- Modify: `.env.example`
- Create: `src/lib/server/webhooks.ts`

- [x] **Step 1: Declare the env vars**

In `src/env.ts`, add after `ORGANIZER_ROLE_ID`:

```ts
	WEBHOOK_RESULTS_URL: { description: 'Discord webhook for the results channel. Empty = off.' },
	WEBHOOK_ORGANIZERS_URL: { description: 'Discord webhook for the organizer channel. Empty = off.' }
```

(No `schema`: the value must be set but may be empty, which is how dev turns posting off.)

Append to `.env.example`:

```
WEBHOOK_RESULTS_URL=
WEBHOOK_ORGANIZERS_URL=
```

Add the same two empty lines to your local `.env`, or the app refuses to start.

- [x] **Step 2: Write the module**

Create `src/lib/server/webhooks.ts`:

```ts
import { WEBHOOK_ORGANIZERS_URL, WEBHOOK_RESULTS_URL } from '$app/env/private';

// Fire-and-forget: failures are logged and never undo or block the change that triggered them.
async function post(url: string, content: string) {
	if (!url) return;
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// Names and flag reasons are user text: never let them ping @everyone, roles or users.
			body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
		});
		if (!res.ok) console.error(`Discord webhook failed: ${res.status}`);
	} catch (e) {
		console.error(e);
	}
}

export const postResult = (content: string) => void post(WEBHOOK_RESULTS_URL, content);
export const postToOrganizers = (content: string) => void post(WEBHOOK_ORGANIZERS_URL, content);
```

- [x] **Step 3: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [x] **Step 4: Commit**

```bash
git add src/env.ts .env.example src/lib/server/webhooks.ts
git commit -m "feat(server): Discord result and organizer webhooks"
```

---

### Task 5: MatchCard component and form styles

**Files:**

- Create: `src/lib/components/MatchCard.svelte`
- Modify: `src/app.css` (append)

- [x] **Step 1: Write the component**

From the design system's `MatchCard` (statuses limited to what Plan 4 shows; `overdue`, `live` and `double-loss` come with Plans 5–6). Create `src/lib/components/MatchCard.svelte`:

```svelte
<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';

	type Side = { name: string; avatar: string | null; legend: string | null; games: number | null };
	let {
		head,
		sides,
		dice = null,
		status,
		note = ''
	}: {
		head: string;
		sides: [Side, Side];
		dice?: 0 | 1 | null;
		status: 'scheduled' | 'reported' | 'flagged' | 'void';
		note?: string;
	} = $props();

	const BADGE = {
		scheduled: ['', 'Scheduled'],
		reported: ['', 'Final'],
		flagged: ['pb-badge-rank', 'Flagged'],
		void: ['', 'Void']
	} as const;
	const winner = $derived.by(() => {
		const [a, b] = sides.map((s) => s.games);
		if (status === 'void' || a === null || b === null || a === b) return null;
		return a > b ? 0 : 1;
	});
</script>

<article class={['pb-match', `pb-match-${status}`]}>
	<div class="pb-match-head">
		<span>{head}</span>
		<span class={['pb-badge', BADGE[status][0]]}>{BADGE[status][1]}</span>
	</div>
	{#each sides as s, i (i)}
		<div class={['pb-match-p', winner === i && 'is-winner']}>
			<Avatar name={s.name} src={s.avatar} />
			<span class="pb-match-name">
				<span class="pb-match-nm">
					{s.name}
					{#if dice === i}
						<svg class="pb-die" width="14" height="14" viewBox="0 0 14 14" role="img">
							<title>Won the dice roll</title>
							<rect
								x="1.5"
								y="1.5"
								width="11"
								height="11"
								rx="3"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							/>
							<circle cx="5" cy="5" r="1.2" fill="currentColor" />
							<circle cx="9" cy="9" r="1.2" fill="currentColor" />
						</svg>
					{/if}
				</span>
				{#if s.legend}<span class="pb-match-legend">{s.legend}</span>{/if}
			</span>
			<span class="pb-match-score">{s.games ?? '–'}</span>
		</div>
	{/each}
	{#if note}
		<div class="pb-match-foot"><span class="pb-match-note">{note}</span></div>
	{/if}
</article>
```

- [x] **Step 2: Append form styles**

Append to `src/app.css` (from the design's Report board):

```css
/* Report form: choice chips are native radios, so the form works without JS. */
.opt {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 72px;
	min-height: 44px;
	padding: 0 16px;
	border: 1px solid var(--line);
	border-radius: var(--radius-md);
	background: var(--surface);
	font: 400 18px/1 var(--font-mono);
	color: var(--ink);
	cursor: pointer;
}
.opt input {
	position: absolute;
	opacity: 0;
	width: 1px;
	height: 1px;
}
.opt:has(input:checked) {
	background: var(--frost);
	border-color: var(--accent);
	box-shadow: inset 0 0 0 1px var(--accent);
}
.opt:has(input:focus-visible) {
	outline: 2px solid var(--accent);
	outline-offset: 2px;
}
.opt.who {
	font: 500 15px/20px var(--font-sans);
}
.opts {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	border: 0;
	margin: 0;
	padding: 0;
}
.opts legend {
	margin-bottom: 8px;
}
.narrow {
	max-width: 760px;
}
```

- [x] **Step 3: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [x] **Step 4: Commit**

```bash
git add src/lib/components/MatchCard.svelte src/app.css
git commit -m "feat(ui): MatchCard and report form styles from design"
```

---

### Task 6: Match page

**Files:**

- Create: `src/routes/seasons/[slug]/matches/[id]/+page.server.ts`
- Create: `src/routes/seasons/[slug]/matches/[id]/+page.svelte`

- [x] **Step 1: Write the server module**

Create `src/routes/seasons/[slug]/matches/[id]/+page.server.ts`:

```ts
import { error, fail } from '@sveltejs/kit';
import { LEGENDS } from '#lib/legends.ts';
import { matchMode, parseReport, resultLine } from '#lib/league/report.ts';
import { reportingClosed } from '#lib/league/time.ts';
import { playerAction } from '#lib/server/auth.ts';
import {
	flagMatch,
	getMatch,
	isVoided,
	lastLegend,
	matchPlayers,
	saveReport
} from '#lib/server/matches.ts';
import { getSeason } from '#lib/server/seasons.ts';
import { postResult, postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

type Event = { params: { slug: string; id: string }; locals: App.Locals };

// Everything an action re-checks, read in one go. No await between this and the write.
function context({ params, locals }: Event) {
	const season = getSeason(params.slug, locals.user);
	const id = Number(params.id);
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	if (!match) error(404, 'Match not found');
	const closed = reportingClosed(season.deadline, new Date());
	const voided = isVoided(match);
	const mode = matchMode(match, {
		viewerId: locals.user?.id ?? null,
		inPlay: season.status === 'play',
		closed,
		voided
	});
	return { season, match, mode, closed, voided };
}

const named = (p: { id: string; displayName: string }) => ({ id: p.id, name: p.displayName });

export const load: PageServerLoad = (event) => {
	const { season, match, mode, closed, voided } = context(event);
	const [p1, p2] = matchPlayers(match);
	return {
		season,
		match,
		mode,
		closed,
		voided,
		p1,
		p2,
		legends: LEGENDS,
		prefill: {
			p1Legend: match.p1Legend ?? lastLegend(match.p1Id) ?? '',
			p2Legend: match.p2Legend ?? lastLegend(match.p2Id) ?? ''
		}
	};
};

export const actions: Actions = {
	report: async (event) => {
		const user = playerAction(event);
		const { match, mode } = context(event);
		if (mode === 'locked')
			return fail(409, {
				error: true,
				message: 'This result was flagged, so only organizers can change it.'
			});
		if (mode !== 'report' && mode !== 'edit')
			return fail(409, { error: true, message: "You can't report this match (any more)." });

		const form = await event.request.formData();
		const parsed = parseReport(form, match.p1Id, match.p2Id);
		if (!parsed.ok)
			return fail(400, {
				errors: parsed.errors,
				values: Object.fromEntries(form) as Record<string, string>
			});

		// formData() awaited above: re-read so a flag that landed meanwhile still wins.
		const fresh = context(event);
		if (fresh.mode !== mode)
			return fail(409, {
				error: true,
				message: 'This match changed while you were reporting. Check it again.'
			});
		const action = saveReport(fresh.match, user.id, parsed.values);
		const [p1, p2] = matchPlayers(match);
		const line = resultLine(named(p1), named(p2), parsed.values);
		postResult(action === 'edit' ? `Edited: ${line}` : line);
		const opponent = user.id === p1.id ? p2 : p1;
		return {
			message:
				action === 'report'
					? `Result added. ${opponent.displayName} can flag it if something's off.`
					: 'Changes saved and logged in the audit log.'
		};
	},

	flag: async (event) => {
		const user = playerAction(event);
		const reason = String((await event.request.formData()).get('reason') ?? '').trim();
		if (!reason || reason.length > 500)
			return fail(400, { flagError: "Say what's wrong (up to 500 characters)." });

		const { season, match, mode } = context(event);
		if (mode !== 'flag') return fail(409, { error: true, message: "You can't flag this result." });
		flagMatch(match, user.id, reason);
		const [p1, p2] = matchPlayers(match);
		const line = resultLine(named(p1), named(p2), {
			p1Games: match.p1Games!,
			p2Games: match.p2Games!,
			p1Legend: match.p1Legend!,
			p2Legend: match.p2Legend!,
			diceWinnerId: match.diceWinnerId!
		});
		postToOrganizers(
			`Flag: ${user.displayName} flagged ${line}: "${reason}" ${event.url.origin}/seasons/${season.slug}/matches/${match.id}`
		);
		return { message: 'Flagged. An organizer will take a look.' };
	}
};
```

- [x] **Step 2: Write the page**

Create `src/routes/seasons/[slug]/matches/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const m = $derived(data.match);
	const me = $derived(data.user?.id);
	// The viewer's side comes first; form field names stay p1/p2.
	const order = $derived(me === m.p2Id ? (['p2', 'p1'] as const) : (['p1', 'p2'] as const));
	const player = (k: 'p1' | 'p2') => (k === 'p1' ? data.p1 : data.p2);
	const name = (k: 'p1' | 'p2') => player(k).displayName + (player(k).id === me ? ' (you)' : '');
	const opponent = $derived(player(order[1]).displayName);
	const head = $derived(`${m.group ? `${groupName(m.group)} · ` : ''}Round ${m.round}`);
	const values = $derived<Record<string, string>>(
		form && 'values' in form && form.values
			? form.values
			: {
					p1Games: m.p1Games?.toString() ?? '',
					p2Games: m.p2Games?.toString() ?? '',
					p1Legend: data.prefill.p1Legend,
					p2Legend: data.prefill.p2Legend,
					dice: m.diceWinnerId ?? ''
				}
	);
	const errors = $derived<Record<string, string>>((form && 'errors' in form && form.errors) || {});
	const side = (k: 'p1' | 'p2') => ({
		name: player(k).displayName,
		avatar: player(k).avatar,
		legend: k === 'p1' ? m.p1Legend : m.p2Legend,
		games: k === 'p1' ? m.p1Games : m.p2Games
	});
	type Side = ReturnType<typeof side>;
	const sides = $derived<[Side, Side]>([side(order[0]), side(order[1])]);
	const dice = $derived(
		m.diceWinnerId ? (order.indexOf(m.diceWinnerId === m.p1Id ? 'p1' : 'p2') as 0 | 1) : null
	);
	const reporter = $derived(m.reportedBy === m.p1Id ? data.p1 : data.p2);
	const flagger = $derived(m.flaggedBy === m.p1Id ? data.p1 : data.p2);
</script>

<svelte:head>
	<title>{data.p1.displayName} vs {data.p2.displayName} · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="page narrow">
	<div>
		<span class="eyebrow">{head} · Bo3{data.mode === 'edit' ? ' · edit your report' : ''}</span>
		<h1>{player(order[0]).displayName} vs {opponent}</h1>
		{#if data.mode === 'edit'}
			<p class="muted">You can change this until {opponent} flags it.</p>
		{/if}
	</div>

	{#if form?.message}
		<p class={['status', form && 'error' in form && 'is-error']} role="status">
			{form.message}
		</p>
	{/if}

	{#if data.mode === 'report' || data.mode === 'edit'}
		<form method="POST" action="?/report" class="panel report">
			<div class="grid-2">
				{#each order as k (k)}
					<div class="side">
						<div class="who-row">
							<Avatar name={player(k).displayName} src={player(k).avatar} />
							<strong>{name(k)}</strong>
						</div>
						<fieldset class="opts">
							<legend class="eyebrow">Games won</legend>
							{#each [0, 1, 2] as n (n)}
								<label class="opt">
									<input
										type="radio"
										name="{k}Games"
										value={n}
										checked={values[`${k}Games`] === String(n)}
										required
									/>{n}
								</label>
							{/each}
						</fieldset>
						<label class="pb-field">
							Legend
							<select class="pb-input pb-select" name="{k}Legend" required>
								<option value="" disabled selected={!values[`${k}Legend`]}>Pick a legend</option>
								{#each data.legends as l (l)}
									<option value={l} selected={values[`${k}Legend`] === l}>{l}</option>
								{/each}
							</select>
							{#if errors[`${k}Legend`]}
								<span class="pb-hint is-error">{errors[`${k}Legend`]}</span>
							{/if}
						</label>
					</div>
				{/each}
			</div>
			{#if errors.score}<p class="pb-hint is-error" role="alert">{errors.score}</p>{/if}

			<fieldset class="opts">
				<legend class="eyebrow">Who won the dice roll?</legend>
				{#each order as k (k)}
					<label class="opt who">
						<input
							type="radio"
							name="dice"
							value={player(k).id}
							checked={values.dice === player(k).id}
							required
						/>{player(k).displayName}
					</label>
				{/each}
			</fieldset>
			{#if errors.dice}<p class="pb-hint is-error" role="alert">{errors.dice}</p>{/if}

			<div class="actions">
				<button class="pb-btn pb-btn-primary"
					>{data.mode === 'edit' ? 'Save changes' : 'Add result'}</button
				>
				<a href="/seasons/{data.season.slug}" class="muted">Cancel</a>
			</div>
		</form>
	{:else}
		<MatchCard
			{head}
			{sides}
			{dice}
			status={data.voided
				? 'void'
				: m.flaggedBy
					? 'flagged'
					: m.reportedBy
						? 'reported'
						: 'scheduled'}
			note={m.flaggedBy
				? `Flagged by ${flagger.id === me ? 'you' : flagger.displayName} · only organizers can change it now`
				: m.reportedBy
					? `Reported by ${reporter.id === me ? 'you' : reporter.displayName}`
					: ''}
		/>

		{#if data.mode === 'flag'}
			<div class="actions">
				<ConfirmButton
					action="?/flag"
					variant="secondary"
					label="Flag this result"
					title="Flag this result?"
					confirmLabel="Flag result"
				>
					<p>An organizer will review it. After a flag, only organizers can change the result.</p>
					<label class="pb-field">
						What's wrong?
						<textarea
							class="pb-textarea"
							name="reason"
							maxlength="500"
							required
							placeholder="e.g. It was 1-2, not 0-2."></textarea>
					</label>
				</ConfirmButton>
				<span class="muted">Looks right? Nothing to do.</span>
			</div>
			{#if form && 'flagError' in form}<p class="pb-hint is-error">{form.flagError}</p>{/if}
		{:else if data.mode === 'locked' && m.reportedBy === me}
			<section class="panel">
				<h2>Your report is locked</h2>
				<p class="muted">
					{flagger.displayName} flagged this result, so you can't edit it any more. An organizer will
					review it and the decision is logged in the public audit log.
				</p>
			</section>
		{:else if data.mode === 'locked'}
			<p class="muted">You flagged this result. An organizer is reviewing it.</p>
		{:else if data.voided}
			<p class="muted">A player dropped out, so this match doesn't count.</p>
		{:else if data.closed && data.season.status === 'play' && !m.reportedBy}
			<p class="muted">Reporting closed at the season deadline. An organizer enters the result.</p>
		{/if}

		<a href="/seasons/{data.season.slug}">Back to season</a>
	{/if}
</div>

<style>
	.report {
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 20px;
		background: var(--surface);
	}
	.who-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.report .actions {
		border-top: 1px solid var(--line);
		padding-top: 24px;
	}
</style>
```

Notes: `.actions` (flex row, gap) and `.grid-2` already exist in `src/app.css`. Every `fail(409, …)` carries `error: true`, which is what turns the status line red; success returns only `message`.

- [x] **Step 3: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [x] **Step 4: Commit**

```bash
git add 'src/routes/seasons/[slug]/matches'
git commit -m "feat(report): match page with report, edit and flag"
```

---

### Task 7: "Your matches" on the season page + dev helper

**Files:**

- Modify: `src/routes/seasons/[slug]/+page.server.ts`
- Modify: `src/routes/seasons/[slug]/+page.svelte`
- Create: `scripts/report-dev.ts`
- Modify: `package.json`

- [x] **Step 1: Load the viewer's matches**

In `src/routes/seasons/[slug]/+page.server.ts`, import `playerMatches` and add to the returned object in `load`:

```ts
import { playerMatches } from '#lib/server/matches.ts';
```

```ts
myMatches: locals.user && (season.status === 'play' || season.status === 'finished')
	? playerMatches(season.id, locals.user.id)
	: [];
```

- [x] **Step 2: Render the list**

In `src/routes/seasons/[slug]/+page.svelte`, add a name lookup in the script:

```ts
const nameOf = $derived(new Map(data.entries.map((e) => [e.playerId, e.displayName])));
```

and, right after the `{#if form?.message}` block, add:

```svelte
{#if data.myMatches.length}
	<section class="panel">
		<h2>Your matches</h2>
		<ul class="player-list">
			{#each data.myMatches as m (m.id)}
				{@const opp = m.p1Id === user?.id ? m.p2Id : m.p1Id}
				{@const mine = m.p1Id === user?.id ? [m.p1Games, m.p2Games] : [m.p2Games, m.p1Games]}
				<li>
					<span class="muted">Round {m.round}</span>
					<span class="grow">vs {nameOf.get(opp)}</span>
					{#if m.flaggedBy}<span class="pb-badge pb-badge-rank">Flagged</span>{/if}
					{#if m.reportedBy}
						<span class="pb-num">{mine[0]}-{mine[1]}</span>
						<a href="/seasons/{season.slug}/matches/{m.id}">View</a>
					{:else}
						<a class="pb-btn pb-btn-primary pb-btn-sm" href="/seasons/{season.slug}/matches/{m.id}"
							>Report</a
						>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}
```

- [x] **Step 3: Dev helper to report as the opponent**

The flag flow needs a result reported by someone else, and dev has one real account. Create `scripts/report-dev.ts`:

```ts
// Dev only: reports a match as the player who isn't you, so the flag flow can be tested.
// Writes the audit row like the app does; posts nothing to Discord.
import Database from 'better-sqlite3';

process.loadEnvFile();
const [id, me] = process.argv.slice(2);
if (!id || !me) throw new Error('usage: npm run db:report-dev -- <match-id> <your-discord-id>');

const db = new Database(process.env.DATABASE_URL!);
const m = db.prepare('select * from matches where id = ?').get(Number(id)) as
	| { id: number; season_id: number; p1_id: string; p2_id: string; reported_by: string | null }
	| undefined;
if (!m) throw new Error(`No match ${id}`);
if (m.reported_by) throw new Error(`Match ${id} is already reported`);
const other = m.p1_id === me ? m.p2_id : m.p2_id === me ? m.p1_id : null;
if (!other) throw new Error(`${me} doesn't play match ${id}`);

const after = { p1Games: 2, p2Games: 0, p1Legend: 'Jinx', p2Legend: 'Ahri', diceWinnerId: other };
db.transaction(() => {
	db.prepare(
		`update matches set p1_games = 2, p2_games = 0, p1_legend = 'Jinx', p2_legend = 'Ahri',
		 dice_winner_id = ?, reported_by = ?, reported_at = unixepoch() where id = ?`
	).run(other, other, m.id);
	db.prepare(
		`insert into audit (season_id, match_id, actor_id, action, after) values (?, ?, ?, 'report', ?)`
	).run(m.season_id, m.id, other, JSON.stringify(after));
})();
console.log(`Match ${id} reported 2-0 by ${other}.`);
```

In `package.json` scripts, after `db:seed-dev`:

```json
		"db:report-dev": "node scripts/report-dev.ts"
```

- [x] **Step 4: Typecheck and tests**

Run: `npx vitest run && npm run check`
Expected: all tests pass, 0 errors.

- [x] **Step 5: Manual check (dev server)**

Setup: a season in play with your account in it (`npm run db:seed-dev -- <slug> 7` during signup, close signup, lock).

1. `npm run dev`, open the season: "Your matches" lists your rounds with **Report** buttons.
2. Open one: form shows you first, legends pre-filled empty (first report). Submit `2-2` → "That is not a finished Bo3. Check the numbers.", values kept.
3. Submit `2-1`, legends, dice → "Result added. … can flag it …"; page now shows the edit form ("You can change this until … flags it").
4. Edit to `2-0` → "Changes saved …".
5. Open another match, report it: legend pre-fills with your last one.
6. `npm run db:report-dev -- <other-match-id> <your-discord-id>`, open that match → MatchCard + **Flag this result**. Confirm with empty reason → native validation blocks it. Flag with a reason → "Flagged. …", card turns amber, no flag button.
7. `sqlite3 local.db "select action, actor_id, before, after from audit order by id"` → `report`, `edit`, `report`, `report`, `flag` rows with before/after JSON.
8. Optional: set `WEBHOOK_RESULTS_URL` / `WEBHOOK_ORGANIZERS_URL` to a test channel's webhook, report again → messages appear, no mention pings.
9. Logged out, open a match URL → read-only card, no form.

- [x] **Step 6: Commit**

```bash
git add 'src/routes/seasons/[slug]' scripts/report-dev.ts package.json
git commit -m "feat(report): your matches on season page, dev report helper"
```

---

### Task 8: Spec and wrap-up

**Files:**

- Modify: `docs/spec.md`

- [x] **Step 1: Record decisions in the spec**

In `docs/spec.md` → **Reporting & trust**, add:

```markdown
- Either player may report an unreported match; the first report counts.
- Reporting and editing close at the season deadline; flagging stays open until the season is finalized, so a last-minute report can still be disputed. A flag (resolved or not) locks the result for both players.
- Void matches (a player dropped) can't be reported or flagged.
- Match page: `/seasons/[slug]/matches/[id]` (report, edit, flag, read-only).
```

In **Discord integration** → results channel bullet, append: `; edits post again prefixed "Edited:"`. Add a bullet: `Every webhook post disables mentions (allowed_mentions: none), since names and flag reasons are user text; pairings (Plan 6) opt in to user mentions only.`

- [x] **Step 2: Full verification**

Run: `npx vitest run && npm run check && npm run lint`
Expected: all pass. Run `npm run format` first if lint flags formatting only.

- [x] **Step 3: Commit**

```bash
git add docs/spec.md
git commit -m "docs: reporting decisions in spec"
```

- [x] **Step 4: Hand off**

Tick the last box on issue #4, then ask the owner before `git push -u origin plan-4-reporting` and `gh pr create` (body starts `Closes #4`; don't add the PR to the board). Suggest `/security-review` first: this plan adds the first player-writable results and outbound webhooks.
