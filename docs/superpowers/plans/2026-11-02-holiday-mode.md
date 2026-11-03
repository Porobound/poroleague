# Holiday Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players request a holiday; once an organizer approves, the holiday player's matches in the covered unpublished weeks unlock early for the two players in each, who can play and report them; early results stay hidden from everyone else until their round is published (#141).

**Architecture:** One pure predicate, `isPublished(m, publishedRound)` in `src/lib/league/publish.ts` (SQL twin `publishedMatch()` in `schema.ts`), decides whether a result counts anywhere public: standings, legend stats, career, Elo, audit, API, results webhook. Holiday rules (range → weeks, request limits, which matches unlock, who may see them) are pure in `src/lib/league/holiday.ts`; a `holidays` table plus `src/lib/server/holidays.ts` store requests and decisions. Unlocks are derived from holidays (`approved` or `revoked`), never stored per match; publish posts every reported match in the rounds it publishes.

**Tech Stack:** SvelteKit 3 (adapter-node), Svelte 5, Drizzle + better-sqlite3, Vitest, Playwright. No new dependencies.

**Stack position:** first PR of #141 → #142 achievements → #143 cosmetics → #144 API. #142 must count a result only when `isPublished(m, season.publishedRound)` (or `publishedMatch()` in SQL); don't invent a second rule.

**Branch / worktree:** `feat/141-holiday-mode` in a scratchpad worktree (never switch the main checkout). PR title `feat(holiday): players request holiday mode to play upcoming matches early`, body `Closes #141`.

---

## Decisions

From the issue (final) plus the resolutions below, which the plan implements:

- **Week dates** come from `src/lib/league/time.ts` (the issue says `schedule.ts`; the date math lives in `time.ts`). Week _w_ runs `startDate + 7(w-1)` … `startDate + 7w - 1`. A week is unpublished while its last round is past `publishedRound`.
- **Covered weeks** = weeks the range overlaps that have rounds. Label: `weeks 4–5 (rounds 7–10)`, `week 6 (round 11)` (issue format; the design's "Weeks 4–5 · rounds 7–10" is copy only).
- **Limits** (checked on request, in this order, first failure shown): both dates valid, `to ≥ from`, `from ≥ today` (league date), `to - from ≤ 27 days` (span ≤ 4 weeks), `to ≤ deadline`, covers an unpublished week, no overlap with the player's own `pending`/`approved` holidays this season. Requester must have an entry in the season (dropped included: "no special handling"). Season must be `play`. Approve/reject/revoke also only in `play`; they don't re-check limits.
- **Unlocking** is derived: a group match unlocks when its round is unpublished and either player has an `approved` **or `revoked`** holiday covering the match's week. Revoked keeps unlocking, so "matches already unlocked stay visible" holds without per-match state; they stay reportable too (a visible match you can't report would be a dead end). Top-cut matches never unlock (`isPublished` is always true for playoffs).
- **On holiday badge** (approved only, revoked loses it): on the player page head while the current week is one of their approved weeks, with the dates; as a name tag on any pairing in a week their approved holiday covers (match cards: player page, schedule, season page, match page) and in the admin Approved table.
- **Who sees an early match:** its two players on the season player pages (theirs and each other's) and the match page; organizers on Admin → Matches (editable) and the match page (Discord role re-checked via `currentRole`, never the session flag alone). Not on the schedule, season page "your week", standings or anywhere else until published.
- **Results webhook:** a player report or organizer entry on an unpublished match doesn't post to results; organizer edits/entries on it post to the organizer channel (`organizerEditEmbed`). Flags post to organizers as today. "Publish week N" then posts each reported, non-void match of the published rounds to results, one message each.
- **Audit:** `holiday` action, `after: { holiday: playerId, from, to, status }` with status `approved | rejected | revoked`. The reject reason is stored only in `holidays.reason`, never in an audit row. Public line: `Alice — holiday 12–26 Nov approved` (actor in the Who column). The public audit page drops rows whose match is unpublished; the admin overview's recent log shows all.
- **Reject reason** is sent to page data only when the viewer is the holiday player (design: "Organizer's reason" on their page).
- **Standings mask, not drop:** `groupStandings` treats an unpublished result as unplayed instead of removing the match, so deadline double losses behave exactly as today.
- **Holiday request post** to the organizer channel: `Holiday request: Alice` · `Away 2–8 Nov · week 5 (rounds 9–10)` · link to `/seasons/<slug>/admin/season#holidays`.
- Extra column `created_at` on `holidays` for the design's "Asked" column.
- Design copy not taken: revoke dialog's "Matches not played yet go back to their normal weeks" (contradicts the issue; ours: "The On holiday badge goes. Matches already unlocked stay unlocked."), "play by 1 Nov" (ambiguous with several holidays), schedule note "Played early · reported 29 Oct". The "Going away?" pill becomes a small ghost `ConfirmButton` (no custom pill).

## Visibility truth table

Group match _m_, round _r_, `P = season.publishedRound`, `U(m)` = _m_ unlocked (round unpublished and an `approved`/`revoked` holiday of p1 or p2 covers its week).

| Data                                                           | `r ≤ P` (published)    | `r > P`, not `U(m)`                | `r > P`, `U(m)`                                                                                   |
| -------------------------------------------------------------- | ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Pairing on schedule, season page, API `/matches`               | everyone               | nobody                             | nobody                                                                                            |
| Pairing on season player page (`early` section)                | everyone (normal list) | nobody                             | p1, p2 only                                                                                       |
| Match page                                                     | everyone               | 404 for all                        | p1, p2 (can report / flag); organizers (role re-checked) view only; others 404                    |
| Admin → Matches row                                            | organizers, editable   | organizers, "Unpublished", no edit | organizers, "Unlocked early", editable                                                            |
| Result in standings, legend stats, career, Elo, API, own tiles | counts                 | (no result possible)               | excluded for everyone, the two players included                                                   |
| Result on the card (p1/p2 view, match page)                    | shown                  | —                                  | shown to p1, p2, organizers, note "Played early, hidden from standings until week N is published" |
| Audit row of the match (report, flag, edit, resolve)           | public log             | —                                  | admin overview only; public log once published                                                    |
| Results webhook                                                | on report              | —                                  | not on report; on "Publish week N"                                                                |
| Organizer webhook (flag, organizer edit)                       | immediately            | —                                  | immediately                                                                                       |

| Holiday data                         | Holiday player | Other players / visitors  | Organizers                                    |
| ------------------------------------ | -------------- | ------------------------- | --------------------------------------------- |
| Request card (status, dates, covers) | own page       | never                     | Admin → Season → Holidays (pending, approved) |
| Reject reason                        | own page       | never                     | stored, not shown                             |
| "On holiday" badge / tag             | yes            | yes (approved weeks only) | yes                                           |
| Audit row (approve, reject, revoke)  | public         | public                    | public                                        |
| Pending, cancel                      | own page       | never, not audited        | pending list; organizer channel post          |

## File map

- Create `src/lib/league/holiday.ts` + `holiday.spec.ts` — pure holiday rules.
- Modify `src/lib/league/publish.ts` (+spec) — `isPublished`, `published` uses it, `#lib` import.
- Modify `src/lib/league/time.ts` (+spec) — `weekOn(startDate, date)`.
- Modify `src/lib/format.ts` (+spec) — `dateSpan(from, to)`.
- Modify `src/lib/server/db/schema.ts` — `holidays` table, `publishedMatch()`; `drizzle/0007_*.sql` + meta via `npm run db:generate`.
- Create `src/lib/server/holidays.ts` + `holidays.spec.ts` — reads, writes, audit.
- Modify `src/lib/server/seasons.ts` (`groupStandings`), `src/lib/server/api.ts` (`legendList`), `src/lib/server/players.ts` (`leaderboard`), `src/lib/server/auditLog.ts`, `src/lib/server/resultActions.ts`, `src/lib/server/seasonAdmin.ts`, `src/lib/discord.ts` (+spec), `src/lib/matchCard.ts` (+spec).
- Modify routes: `seasons/[slug]/legends`, `audit`, `admin/+page.server.ts`, `admin/matches`, `admin/season`, `players/[id]`, `matches/[id]`, `schedule`, `+page.server.ts` (season).
- Modify components `MatchCard.svelte`, `PlayerName.svelte`; replace `src/lib/styles/porobound.css`.
- Modify `src/lib/server/test/setup.ts` (wipe `holidays`).
- e2e: create `e2e/holiday.spec.ts`; modify `e2e/db.ts`, `e2e/fixtures.ts`, `e2e/mobile.spec.ts`.
- Scripts: modify `scripts/reseed-dev.ts`, `scripts/report-dev.ts`; create `scripts/holiday-dev.ts`; `package.json` script; `README.md`.
- Docs: `docs/spec.md`, `docs/rules.md`.

---

### Task 1: Re-sync the design-system snapshot

The holiday boards use `.pb-badge-sm` (name tag, "On holiday"), added to the Porobound DS after the current snapshot (1793485399-984c). The same DS version also adds the cosmetics classes (`.pb-framed`, `.pb-flair*`, `.pb-ring`, tier tokens) that #143 needs; they're unused until then and harmless.

**Files:** Modify `src/lib/styles/porobound.css`

- [ ] **Step 1:** Read the DS artifact `https://claude.ai/code/artifact/fac309c5-b28d-4505-952e-30bb066272a5` (`project/tokens.json` is not the CSS; take `tokens.css` + `project/components/bundle.css` as the previous snapshot did: minus the font `@import`, `body` rules and demo helpers). Replace `src/lib/styles/porobound.css` wholesale; update the header comment to the served version (1793634312-07d5 at planning time).
- [ ] **Step 2:** Confirm `.pb-badge-sm{padding:0 8px;font-size:11px;line-height:16px;flex:none;white-space:nowrap}` is present: `grep -n 'pb-badge-sm' src/lib/styles/porobound.css`.
- [ ] **Step 3:** `npm run check && npx vitest run && npm run test:e2e -- mobile.spec.ts theme.spec.ts` — expect PASS (no layout change).
- [ ] **Step 4:** Commit.

```bash
git add src/lib/styles/porobound.css
git commit -m "chore(styles): re-sync Porobound snapshot with name tags"
```

---

### Task 2: One rule for published results, applied everywhere

Independent of holidays: today no result exists in an unpublished round, so every change here is a no-op on current data. It makes the later early results safe by construction.

**Files:**

- Modify `src/lib/league/publish.ts`, `src/lib/league/publish.spec.ts`
- Modify `src/lib/server/db/schema.ts` (helper only, no table change)
- Modify `src/lib/server/seasons.ts` (`groupStandings`), `src/lib/server/api.ts` (`legendList`), `src/lib/server/players.ts` (`leaderboard`), `src/lib/server/auditLog.ts` (`auditLines`)
- Modify `src/routes/seasons/[slug]/legends/+page.server.ts`, `src/routes/seasons/[slug]/audit/+page.server.ts`, `src/routes/seasons/[slug]/admin/+page.server.ts`
- Test: `src/lib/server/seasons.spec.ts`, `src/lib/server/api.spec.ts`, `src/lib/server/players.spec.ts`, `src/lib/server/pages.spec.ts`

- [ ] **Step 1: Failing unit test** in `publish.spec.ts`:

```ts
describe('isPublished', () => {
	it('counts group rounds up to the published one, and every top-cut match', () => {
		expect(isPublished({ round: 2 }, 2)).toBe(true);
		expect(isPublished({ round: 3 }, 2)).toBe(false);
		expect(isPublished({ stage: 'group', round: 3 }, 2)).toBe(false);
		expect(isPublished({ stage: 'playoff', round: 3 }, 0)).toBe(true);
	});
});
```

- [ ] **Step 2:** `npx vitest run src/lib/league/publish.spec.ts` → FAIL (`isPublished` not exported).
- [ ] **Step 3: Implement** `src/lib/league/publish.ts` (also switch the import to `#lib/league/time.ts`, so Node dev scripts can import this file):

```ts
import { roundsOfWeek, weekOf } from '#lib/league/time.ts';

// … nextPublish unchanged …

// The one rule for whether a result counts anywhere public (standings, stats, Elo, audit, API,
// results webhook): its round is published. Holiday mode lets matches be reported before that.
// Top-cut matches are public once they exist. SQL twin: publishedMatch() in schema.ts.
export const isPublished = (m: { stage?: string; round: number }, publishedRound: number) =>
	m.stage === 'playoff' || m.round <= publishedRound;

// Players only see matches of published rounds.
export const published = <T extends { stage?: string; round: number }>(
	ms: T[],
	publishedRound: number
) => ms.filter((m) => isPublished(m, publishedRound));
```

- [ ] **Step 4:** `npx vitest run src/lib/league/publish.spec.ts` → PASS.
- [ ] **Step 5: SQL twin** in `schema.ts`, after `former()`:

```ts
// SQL twin of isPublished (league/publish.ts); the query must join seasons.
export const publishedMatch = () =>
	sql<boolean>`(${matches.stage} = 'playoff' or ${matches.round} <= ${seasons.publishedRound})`;
```

(`matches` is declared after `seasons`; put this after the `matches` table.)

- [ ] **Step 6: Failing server tests.** Add a test helper in each spec that writes a result into an unpublished round directly (what holiday mode will do), e.g. in `seasons.spec.ts`:

```ts
it('groupStandings leaves out results of unpublished rounds, but keeps the round count', () => {
	// season: one group p1–p3, publishedRound 1; m2 (round 2) reported early
	db.update(matches)
		.set({
			p1Games: 2,
			p2Games: 0,
			p1Legend: 'Jinx',
			p2Legend: 'Ahri',
			diceWinnerId: 'p1',
			reportedBy: 'p1',
			reportedAt: new Date()
		})
		.where(eq(matches.id, m2))
		.run();
	const [g] = groupStandings(season, seasonEntries(season.id));
	expect(g.rows.every((r) => r.played === 0)).toBe(true);
	expect(g.rounds).toBe(3);
	db.update(seasons).set({ publishedRound: 2 }).where(eq(seasons.id, season.id)).run();
	const [after] = groupStandings({ ...season, publishedRound: 2 }, seasonEntries(season.id));
	expect(after.rows.find((r) => r.playerId === 'p1')!.points).toBe(3);
});
```

Same shape for:

- `api.spec.ts`: `seasonDetail` standings `played` 0 and `legendList` empty while the round is unpublished; both count after publishing.
- `players.spec.ts` (`leaderboard`): the early result changes no rating or `played`; after publishing it does.
- `pages.spec.ts`: legends page `matches === 0`; career page (`careerLoad`) totals `played === 0`; season player page tiles (`row.played`, `dice.of`) 0 — viewed by p1 too.
- `seasons.spec.ts` (`auditLines`): a `report` audit row on the unpublished match is missing from `auditLines(id, { publishedRound: 1 })` and present in `auditLines(id)`; a row with `matchId: null` (e.g. `publish`) is in both. Update the existing `auditLines(season.id, 2)` call to `auditLines(season.id, { limit: 2 })`.

- [ ] **Step 7:** `npx vitest run src/lib/server` → the new tests FAIL.
- [ ] **Step 8: Implement.**

`seasons.ts` `groupStandings` — mask, don't drop (keeps deadline double losses and `rounds`):

```ts
const results = ms.map((m) => {
	const shown = isPublished(m, season.publishedRound);
	return {
		p1: m.p1Id,
		p2: m.p2Id,
		p1Games: shown ? m.p1Games : null,
		p2Games: shown ? m.p2Games : null
	};
});
```

`api.ts` `legendList`: `legendMatches(published(seasonMatches(s.id), s.publishedRound), dropped)`.

`legends/+page.server.ts`: `const ms = legendMatches(published(all, season.publishedRound), dropped);` (keep `all` for `weeks`).

`players.ts` `leaderboard`: add `publishedMatch()` to the `where(and(...))` of `counted` (the query already joins `seasons`).

`auditLog.ts`:

```ts
// Newest first, one readable line per audit row. With `publishedRound` (the public log), rows of
// matches in unpublished rounds are left out: holiday mode reports those early.
export function auditLines(seasonId: number, o: { limit?: number; publishedRound?: number } = {}) {
	…
	return seasonAudit(seasonId)
		.filter(
			(r) =>
				o.publishedRound === undefined ||
				r.round === null ||
				isPublished({ stage: r.stage ?? undefined, round: r.round }, o.publishedRound)
		)
		.slice(0, o.limit)
		.map(…)
```

Callers: `audit/+page.server.ts` → `auditLines(season.id, { publishedRound: season.publishedRound })`; `admin/+page.server.ts` → `auditLines(season.id, { limit: 5 })`; `topCut.spec.ts` calls stay `auditLines(id)`.

- [ ] **Step 9:** `npx vitest run` → PASS. `npm run check` → 0 errors.
- [ ] **Step 10:** Commit.

```bash
git add src/lib/league/publish.ts src/lib/league/publish.spec.ts src/lib/server src/routes
git commit -m "feat(holiday): count results only once their round is published"
```

---

### Task 3: Pure holiday rules

**Files:**

- Create `src/lib/league/holiday.ts`, `src/lib/league/holiday.spec.ts`
- Modify `src/lib/league/time.ts`, `src/lib/league/time.spec.ts`
- Modify `src/lib/format.ts`, `src/lib/format.spec.ts`

- [ ] **Step 1: Failing tests.**

`time.spec.ts`:

```ts
it('weekOn: week of a league date, 0 before the start', () => {
	expect(weekOn('2026-10-05', '2026-10-05')).toBe(1);
	expect(weekOn('2026-10-05', '2026-10-11')).toBe(1);
	expect(weekOn('2026-10-05', '2026-10-12')).toBe(2);
	expect(weekOn('2026-10-05', '2026-10-04')).toBe(0);
});
```

`format.spec.ts`:

```ts
it('dateSpan: one month once, both across months, one day alone', () => {
	expect(dateSpan('2026-11-12', '2026-11-26')).toBe('12–26 Nov');
	expect(dateSpan('2026-10-26', '2026-11-08')).toBe('26 Oct–8 Nov');
	expect(dateSpan('2026-11-02', '2026-11-02')).toBe('2 Nov');
});
```

`holiday.spec.ts` (calendar: start Mon 5 Oct, 2 rounds a week, 11 rounds → 6 weeks, weeks 1–4 published, deadline 22 Nov, today 2 Nov):

```ts
import { describe, expect, it } from 'vitest';
import {
	awayWeeks,
	coversLabel,
	holidayWeeks,
	isUnlocked,
	requestError,
	unlockedWeeks,
	visibleTo
} from './holiday';

const cal = {
	startDate: '2026-10-05',
	roundsPerWeek: 2,
	maxRound: 11,
	publishedRound: 8,
	deadline: '2026-11-22'
};
const today = '2026-11-02';
const err = (from: string, to: string, own = []) =>
	requestError({ from, to }, { ...cal, today }, own);

describe('holidayWeeks', () => {
	it('maps a range to the weeks it overlaps that have rounds', () => {
		expect(holidayWeeks({ from: '2026-11-04', to: '2026-11-10' }, cal)).toEqual([5, 6]);
		expect(holidayWeeks({ from: '2026-11-02', to: '2026-11-08' }, cal)).toEqual([5]);
		expect(holidayWeeks({ from: '2026-11-16', to: '2026-11-22' }, cal)).toEqual([]); // week 7: no rounds
		expect(holidayWeeks({ from: '2026-09-01', to: '2026-10-06' }, cal)).toEqual([1]);
	});
});

describe('coversLabel', () => {
	it('names weeks and rounds', () => {
		expect(coversLabel([4, 5], 2, 11)).toBe('weeks 4–5 (rounds 7–10)');
		expect(coversLabel([6], 2, 11)).toBe('week 6 (round 11)');
		expect(coversLabel([5], 2, 11)).toBe('week 5 (rounds 9–10)');
	});
});

describe('requestError', () => {
	it('accepts a range in unpublished weeks', () =>
		expect(err('2026-11-03', '2026-11-12')).toBeNull());
	it('needs two dates, in order', () => {
		expect(err('', '2026-11-12')).toMatch(/first and last day/);
		expect(err('2026-11-12', '2026-11-03')).toMatch(/before the first/);
	});
	it('starts today or later', () => {
		expect(err('2026-11-02', '2026-11-03')).toBeNull();
		expect(err('2026-11-01', '2026-11-03')).toMatch(/past/);
	});
	it('spans at most 4 weeks', () => {
		expect(err('2026-11-03', '2026-11-30')).not.toMatch(/4 weeks/); // 28 days: fails the deadline instead
		expect(
			requestError(
				{ from: '2026-11-03', to: '2026-12-01' },
				{ ...cal, deadline: '2026-12-31', today },
				[]
			)
		).toMatch(/4 weeks/);
	});
	it('ends by the deadline', () => expect(err('2026-11-20', '2026-11-23')).toMatch(/deadline/));
	it('covers an unpublished week', () => {
		expect(err('2026-11-16', '2026-11-20')).toMatch(/still to be published/);
		expect(
			requestError(
				{ from: '2026-11-03', to: '2026-11-05' },
				{ ...cal, publishedRound: 10, today },
				[]
			)
		).toMatch(/still to be published/);
	});
	it("doesn't overlap the player's pending or approved holidays", () => {
		const own = (status: string) => [{ from: '2026-11-08', to: '2026-11-09', status }] as never;
		expect(err('2026-11-03', '2026-11-08', own('pending'))).toMatch(/already/);
		expect(err('2026-11-09', '2026-11-12', own('approved'))).toMatch(/already/);
		for (const s of ['rejected', 'cancelled', 'revoked'])
			expect(err('2026-11-03', '2026-11-09', own(s))).toBeNull();
		expect(err('2026-11-10', '2026-11-12', own('approved'))).toBeNull();
	});
});

describe('unlocks', () => {
	const hs = [
		{ playerId: 'a', from: '2026-11-02', to: '2026-11-08', status: 'approved' }, // week 5
		{ playerId: 'b', from: '2026-11-09', to: '2026-11-15', status: 'revoked' }, // week 6
		{ playerId: 'c', from: '2026-11-09', to: '2026-11-15', status: 'pending' },
		{ playerId: 'd', from: '2026-11-09', to: '2026-11-15', status: 'rejected' }
	] as const;
	const unlocked = unlockedWeeks([...hs], cal.startDate);
	const s = { publishedRound: 8, roundsPerWeek: 2 };
	const m = (round: number, p1Id: string, p2Id: string, stage?: 'group' | 'playoff') => ({
		round,
		p1Id,
		p2Id,
		stage
	});

	it('unlocks only the holiday player’s matches in covered unpublished weeks', () => {
		expect(isUnlocked(m(9, 'a', 'x'), s, unlocked)).toBe(true);
		expect(isUnlocked(m(10, 'x', 'a'), s, unlocked)).toBe(true);
		expect(isUnlocked(m(9, 'x', 'y'), s, unlocked)).toBe(false);
		expect(isUnlocked(m(11, 'a', 'x'), s, unlocked)).toBe(false); // week 6 not covered
		expect(isUnlocked(m(7, 'a', 'x'), s, unlocked)).toBe(false); // already published
		expect(isUnlocked(m(9, 'a', 'x', 'playoff'), s, unlocked)).toBe(false);
	});
	it('a revoke keeps what was unlocked; pending and rejected unlock nothing', () => {
		expect(isUnlocked(m(11, 'b', 'x'), s, unlocked)).toBe(true);
		expect(isUnlocked(m(11, 'c', 'x'), s, unlocked)).toBe(false);
		expect(isUnlocked(m(11, 'd', 'x'), s, unlocked)).toBe(false);
	});
	it('the badge is for approved holidays only', () => {
		const away = awayWeeks([...hs], cal.startDate);
		expect([...away.keys()]).toEqual(['a']);
		expect([...away.get('a')!]).toEqual([5]);
	});
	it('only the two players see an unlocked match; everyone sees published ones', () => {
		expect(visibleTo(m(9, 'a', 'x'), 'a', s, unlocked)).toBe(true);
		expect(visibleTo(m(9, 'a', 'x'), 'x', s, unlocked)).toBe(true);
		expect(visibleTo(m(9, 'a', 'x'), 'y', s, unlocked)).toBe(false);
		expect(visibleTo(m(9, 'a', 'x'), null, s, unlocked)).toBe(false);
		expect(visibleTo(m(9, 'x', 'y'), 'x', s, unlocked)).toBe(false);
		expect(visibleTo(m(8, 'x', 'y'), null, s, unlocked)).toBe(true);
	});
});
```

- [ ] **Step 2:** `npx vitest run src/lib/league src/lib/format.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**

`time.ts` — export the week of a date and reuse it:

```ts
// The week a league date falls in; 0 before the start date.
export const weekOn = (startDate: string, date: string) =>
	Math.max(0, Math.floor(daysBetween(startDate, date) / 7) + 1);

export const currentWeek = (startDate: string | null, now: Date) =>
	startDate ? weekOn(startDate, leagueDate(now)) : 0;
```

`format.ts`:

```ts
// "12–26 Nov", "26 Oct–8 Nov", "2 Nov": a holiday's dates.
export function dateSpan(from: string, to: string) {
	const part = (d: string) =>
		new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		});
	if (from === to) return part(from);
	return from.slice(0, 7) === to.slice(0, 7)
		? `${Number(from.slice(8))}–${part(to)}`
		: `${part(from)}–${part(to)}`;
}
```

`holiday.ts` (imports with `#lib/… .ts` so `scripts/` can use it under Node):

```ts
import { isPublished } from '#lib/league/publish.ts';
import { addDays, roundsOfWeek, weekOf, weekOn } from '#lib/league/time.ts';

export const HOLIDAY_STATUSES = [
	'pending',
	'approved',
	'rejected',
	'cancelled',
	'revoked'
] as const;
export type HolidayStatus = (typeof HOLIDAY_STATUSES)[number];
export type Range = { from: string; to: string };
export type Holiday = Range & { playerId: string; status: HolidayStatus };
// Player id → weeks.
export type WeekMap = Map<string, Set<number>>;
type Calendar = { startDate: string; roundsPerWeek: number; maxRound: number };

const MAX_DAYS = 28;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (d: string) => ISO.test(d) && addDays(d, 0) === d;

// Weeks the range overlaps that have rounds (lastWeek defaults to the schedule's last week).
export function holidayWeeks(r: Range, c: Calendar | { startDate: string }) {
	const last = 'maxRound' in c ? weekOf(c.maxRound, c.roundsPerWeek) : Infinity;
	const first = Math.max(1, weekOn(c.startDate, r.from));
	const end = Math.min(last, weekOn(c.startDate, r.to));
	return Array.from({ length: Math.max(0, end - first + 1) }, (_, i) => first + i);
}

const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
// "weeks 4–5 (rounds 7–10)"; weeks are consecutive.
export function coversLabel(weeks: number[], roundsPerWeek: number, maxRound: number) {
	if (!weeks.length) return '';
	const [a, b] = [weeks[0], weeks.at(-1)!];
	const [r1, r2] = [
		roundsOfWeek(a, roundsPerWeek, maxRound)![0],
		roundsOfWeek(b, roundsPerWeek, maxRound)![1]
	];
	return `${a === b ? 'week' : 'weeks'} ${span(a, b)} (${r1 === r2 ? 'round' : 'rounds'} ${span(r1, r2)})`;
}

const OPEN: HolidayStatus[] = ['pending', 'approved'];
export function requestError(
	r: Range,
	c: Calendar & { publishedRound: number; deadline: string | null; today: string },
	own: (Range & { status: HolidayStatus })[]
): string | null {
	if (!isDate(r.from) || !isDate(r.to)) return 'Pick the first and last day you’re away.';
	if (r.to < r.from) return 'The last day is before the first.';
	if (r.from < c.today) return 'The first day can’t be in the past.';
	if (addDays(r.from, MAX_DAYS - 1) < r.to) return 'A holiday can be at most 4 weeks.';
	if (c.deadline && r.to > c.deadline) return 'Pick dates up to the season deadline.';
	const open = holidayWeeks(r, c).filter(
		(w) => roundsOfWeek(w, c.roundsPerWeek, c.maxRound)![1] > c.publishedRound
	);
	if (!open.length) return 'Those dates don’t cover a week that’s still to be published.';
	if (own.some((h) => OPEN.includes(h.status) && h.from <= r.to && r.from <= h.to))
		return 'You already asked for a holiday on some of those days.';
	return null;
}

function weekMap(hs: Holiday[], statuses: HolidayStatus[], startDate: string): WeekMap {
	const map: WeekMap = new Map();
	for (const h of hs.filter((h) => statuses.includes(h.status))) {
		const set = map.get(h.playerId) ?? new Set();
		for (const w of holidayWeeks(h, { startDate })) set.add(w);
		map.set(h.playerId, set);
	}
	return map;
}
// A revoke removes the badge but can't un-leak a pairing, so revoked holidays keep unlocking.
export const unlockedWeeks = (hs: Holiday[], startDate: string) =>
	weekMap(hs, ['approved', 'revoked'], startDate);
export const awayWeeks = (hs: Holiday[], startDate: string) => weekMap(hs, ['approved'], startDate);

type M = { stage?: string; round: number; p1Id: string; p2Id: string };
type S = { publishedRound: number; roundsPerWeek: number };

// Unpublished, and a player of it is on an approved (or since revoked) holiday that week.
export const isUnlocked = (m: M, s: S, unlocked: WeekMap) =>
	!isPublished(m, s.publishedRound) &&
	[m.p1Id, m.p2Id].some((id) => unlocked.get(id)?.has(weekOf(m.round, s.roundsPerWeek)));

// Who may see a match (pairing and result): everyone once published; before that, only its two
// players, and only if a holiday unlocked it. Organizers get the same via isUnlocked on admin pages.
export const visibleTo = (m: M, viewerId: string | null, s: S, unlocked: WeekMap) =>
	isPublished(m, s.publishedRound) ||
	(!!viewerId && (m.p1Id === viewerId || m.p2Id === viewerId) && isUnlocked(m, s, unlocked));
```

- [ ] **Step 4:** `npx vitest run src/lib/league src/lib/format.spec.ts` → PASS.
- [ ] **Step 5:** Commit.

```bash
git add src/lib/league src/lib/format.ts src/lib/format.spec.ts
git commit -m "feat(holiday): pure rules for holiday weeks, limits and unlocks"
```

---

### Task 4: `holidays` table, server module, audit lines

**Files:**

- Modify `src/lib/server/db/schema.ts`; generate `drizzle/0007_*.sql` + `drizzle/meta/*`
- Create `src/lib/server/holidays.ts`, `src/lib/server/holidays.spec.ts`
- Modify `src/lib/server/auditLog.ts`, `src/lib/server/test/setup.ts`, `src/lib/server/test/seed.ts`

- [ ] **Step 1: Schema.**

```ts
import { HOLIDAY_STATUSES } from '#lib/league/holiday.ts';

export const holidays = sqliteTable(
	'holidays',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		seasonId: integer('season_id')
			.notNull()
			.references(() => seasons.id),
		playerId: text('player_id')
			.notNull()
			.references(() => players.id),
		from: text('from_date').notNull(), // ISO date, first day away
		to: text('to_date').notNull(), // ISO date, last day away
		status: text('status', { enum: HOLIDAY_STATUSES }).notNull().default('pending'),
		decidedBy: text('decided_by').references(() => players.id),
		decidedAt: integer('decided_at', { mode: 'timestamp' }),
		reason: text('reason'), // reject reason: shown to the player only, never audited
		createdAt: createdAt()
	},
	(t) => [index('holidays_season_idx').on(t.seasonId)]
);
```

If drizzle-kit can't resolve the `#lib` import from `drizzle.config.ts`, inline the enum array and assert equality in `holiday.spec.ts` instead.

- [ ] **Step 2:** `npm run db:generate` → new `drizzle/0007_<name>.sql` with `CREATE TABLE holidays` and the index. `src/lib/server/db/migrate.spec.ts` should still pass.
- [ ] **Step 3:** `setup.ts`: wipe `holidays` first: `for (const t of [holidays, audit, sessions, matches, entries, seasons, players])`. `seed.ts`:

```ts
export const seedHoliday = (values: typeof holidays.$inferInsert) =>
	db.insert(holidays).values(values).returning().get();
```

- [ ] **Step 4: Failing tests** `holidays.spec.ts`:

```ts
// season s1 in play: p1–p4, one group, start 2026-10-05, 2 rounds a week, rounds 1–3, published 2.
describe('holiday writes', () => {
	it('requestHoliday stores a pending request, unaudited', () => {
		const h = requestHoliday(season.id, 'p1', { from: '2026-10-12', to: '2026-10-14' });
		expect(h.status).toBe('pending');
		expect(db.select().from(audit).all()).toEqual([]);
	});
	it('cancelHoliday cancels only your own pending request, unaudited', () => {
		const h = requestHoliday(season.id, 'p1', range);
		expect(cancelHoliday(season.id, h.id, 'p2')).toBe(false);
		expect(cancelHoliday(season.id, h.id, 'p1')).toBe(true);
		expect(getHoliday(season.id, h.id)!.status).toBe('cancelled');
		expect(cancelHoliday(season.id, h.id, 'p1')).toBe(false);
		expect(db.select().from(audit).all()).toEqual([]);
	});
	it('decideHoliday records who and when and audits without the reason', () => {
		const h = requestHoliday(season.id, 'p1', range);
		decideHoliday(h, 'org', 'rejected', 'Ask a week ahead.');
		const row = getHoliday(season.id, h.id)!;
		expect(row).toMatchObject({ status: 'rejected', decidedBy: 'org', reason: 'Ask a week ahead.' });
		const [a] = db.select().from(audit).all();
		expect(a).toMatchObject({ action: 'holiday', actorId: 'org', matchId: null, after: { holiday: 'p1', from: range.from, to: range.to, status: 'rejected' } });
		expect(JSON.stringify(a)).not.toContain('Ask a week ahead');
	});
	it('seasonUnlocks: approved and revoked holidays of this season only', () => { … });
});

describe('audit lines', () => {
	it('reads "Player 1 — holiday 12–14 Oct approved" for everyone', () => {
		decideHoliday(requestHoliday(season.id, 'p1', range), 'org', 'approved');
		const [l] = auditLines(season.id, { publishedRound: 0 });
		expect([l.label, l.what]).toEqual(['Holiday', 'Player 1 — holiday 12–14 Oct approved']);
	});
});
```

- [ ] **Step 5:** `npx vitest run src/lib/server/holidays.spec.ts` → FAIL.
- [ ] **Step 6: Implement** `src/lib/server/holidays.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';
import { unlockedWeeks, awayWeeks, type Range } from '#lib/league/holiday.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, former, holidays, players } from '#lib/server/db/schema.ts';

export type HolidayRow = typeof holidays.$inferSelect;

export const seasonHolidays = (seasonId: number) =>
	db
		.select({ h: holidays, name: players.displayName, avatar: players.avatar, former: former() })
		.from(holidays)
		.innerJoin(players, eq(holidays.playerId, players.id))
		.where(eq(holidays.seasonId, seasonId))
		.orderBy(asc(holidays.id))
		.all()
		.map(({ h, ...p }) => ({ ...h, ...p }));
export type SeasonHoliday = ReturnType<typeof seasonHolidays>[number];

export const getHoliday = (seasonId: number, id: number) =>
	db
		.select()
		.from(holidays)
		.where(and(eq(holidays.id, id), eq(holidays.seasonId, seasonId)))
		.get();

// Which weeks are unlocked (approved or revoked) and who is away (approved), per player.
export function seasonUnlocks(
	season: { id: number; startDate: string | null },
	list = seasonHolidays(season.id)
) {
	const start = season.startDate ?? '9999-12-31';
	return { unlocked: unlockedWeeks(list, start), away: awayWeeks(list, start) };
}

// Pending requests and cancels aren't audited.
export const requestHoliday = (seasonId: number, playerId: string, r: Range) =>
	db
		.insert(holidays)
		.values({ seasonId, playerId, ...r })
		.returning()
		.get();

export const cancelHoliday = (seasonId: number, id: number, playerId: string) =>
	db
		.update(holidays)
		.set({ status: 'cancelled' })
		.where(
			and(
				eq(holidays.id, id),
				eq(holidays.seasonId, seasonId),
				eq(holidays.playerId, playerId),
				eq(holidays.status, 'pending')
			)
		)
		.run().changes > 0;

// Approve, reject or revoke, with its public audit row. The reason stays off the audit row.
export function decideHoliday(
	h: HolidayRow,
	actorId: string,
	status: 'approved' | 'rejected' | 'revoked',
	reason?: string
) {
	db.transaction((tx) => {
		tx.update(holidays)
			.set({
				status,
				decidedBy: actorId,
				decidedAt: new Date(),
				...(status === 'rejected' ? { reason: reason || null } : {})
			})
			.where(eq(holidays.id, h.id))
			.run();
		tx.insert(audit)
			.values({
				seasonId: h.seasonId,
				actorId,
				action: 'holiday',
				after: { holiday: h.playerId, from: h.from, to: h.to, status }
			})
			.run();
	});
}
```

`auditLog.ts`: add `holiday?: string; from?: string; to?: string; status?: string` to `Change`, `holiday: 'Holiday'` to `LABEL`, and in `what`:

```ts
after?.holiday ? `${name(after.holiday)} — holiday ${dateSpan(after.from!, after.to!)} ${after.status}` : '',
```

- [ ] **Step 7:** `npx vitest run` → PASS; `npm run check`.
- [ ] **Step 8:** Commit.

```bash
git add src/lib/server drizzle
git commit -m "feat(holiday): holidays table with audited decisions"
```

---

### Task 5: Player requests and cancels a holiday

**Files:**

- Modify `src/lib/discord.ts`, `src/lib/discord.spec.ts` — `holidayEmbed`
- Modify `src/routes/seasons/[slug]/players/[id]/+page.server.ts`, `+page.svelte`
- Test: `src/lib/server/holidays.spec.ts` (actions + load)

- [ ] **Step 1: Failing tests.**

`discord.spec.ts`:

```ts
it('holidayEmbed: escaped name, dates, covers, admin link', () => {
	const e = holidayEmbed({
		player: '*Al*',
		dates: '2–8 Nov',
		covers: 'week 5 (rounds 9–10)',
		where: 'Autumn 2026',
		url: 'https://x/seasons/a/admin/season#holidays'
	});
	expect(e.title).toBe('Holiday request: \\*Al\\*');
	expect(e.description).toBe(
		'Away 2–8 Nov · week 5 (rounds 9–10). Approve or reject in season admin.'
	);
	expect(e.url).toBe('https://x/seasons/a/admin/season#holidays');
});
```

`holidays.spec.ts` — mock webhooks for this file:

```ts
const hooks = vi.hoisted(() => ({ postResult: vi.fn(), postToOrganizers: vi.fn() }));
vi.mock('#lib/server/webhooks.ts', async (o) => ({
	...(await o<typeof import('#lib/server/webhooks.ts')>()),
	...hooks
}));
// Freeze "today": vi.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z'), toFake: ['Date'] }) in beforeEach.
```

Cases (use the `event`/`outcome`/`status` helpers copied from `actions.spec.ts`):

- `requestHoliday` action on own page in play → `{ message: 'Holiday requested for 12–14 Oct. An organizer will look at it.' }`, a pending row, one `postToOrganizers` call.
- on someone else's page → 403; logged out → redirect to login; not in play → 409; not entered → 403; each limit violation → `fail(400, { holidayError })` with the `requestError` text (one case is enough here, the rules are unit-tested).
- `cancelHoliday` → `{ message: 'Request cancelled.' }`; second time → 409.
- load: `data.holidays` lists own holidays (non-cancelled, newest first) with `away`, `covers`, `status`, and `reason` only for the owner; viewed by p2 or logged out → `holidays: []`, `canRequest: false`, and the response JSON never contains the reason string.

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**

`discord.ts`:

```ts
export const holidayEmbed = (o: {
	player: string;
	dates: string;
	covers: string;
	where: string;
	url: string;
}): Embed => ({
	title: `Holiday request: ${escapeMd(o.player)}`,
	url: o.url,
	description: `Away ${o.dates} · ${o.covers}. Approve or reject in season admin.`,
	color: SIGNAL,
	footer: { text: o.where },
	timestamp: new Date().toISOString()
});
```

`players/[id]/+page.server.ts`, load additions (`maxRound` from `seasonMatches(season.id)`; the page already reads `playerMatches`):

```ts
const isMe = locals.user?.id === player.playerId;
const all = seasonMatches(season.id);
const maxRound = Math.max(0, ...all.map((m) => m.round));
const hs = seasonHolidays(season.id);
const mine = hs.filter((h) => h.playerId === player.playerId);
const cal = { startDate: season.startDate ?? '', roundsPerWeek: season.roundsPerWeek, maxRound };
…
holidays: isMe
	? mine
			.filter((h) => h.status !== 'cancelled')
			.reverse()
			.map((h) => ({
				id: h.id,
				status: h.status,
				away: dateSpan(h.from, h.to),
				covers: coversLabel(holidayWeeks(h, cal), season.roundsPerWeek, maxRound),
				reason: h.status === 'rejected' ? h.reason : null
			}))
	: [],
canRequest: isMe && season.status === 'play',
// For the dialog's live "Covers …" line; the action re-checks everything.
calendar: isMe && season.status === 'play'
	? { ...cal, publishedRound: season.publishedRound, deadline: season.deadline, today: leagueDate(new Date()), own: mine.map(({ from, to, status }) => ({ from, to, status })) }
	: null,
```

Actions:

```ts
requestHoliday: async (event) => {
	const user = playerAction(event);
	const form = await event.request.formData();
	const season = publicSeason(event.params.slug, user);
	if (event.params.id !== user.id) error(403, 'Only you can ask for your holiday.');
	if (season.status !== 'play') return fail(409, { holidayError: 'Holidays are only for the weeks of play.' });
	if (!seasonEntries(season.id).some((e) => e.playerId === user.id)) error(403, "You're not in this season.");
	const r = { from: String(form.get('from') ?? ''), to: String(form.get('to') ?? '') };
	const maxRound = Math.max(0, ...seasonMatches(season.id).map((m) => m.round));
	const own = seasonHolidays(season.id).filter((h) => h.playerId === user.id);
	const cal = { startDate: season.startDate ?? '', roundsPerWeek: season.roundsPerWeek, maxRound };
	const problem = requestError(r, { ...cal, publishedRound: season.publishedRound, deadline: season.deadline, today: leagueDate(new Date()) }, own);
	if (problem) return fail(400, { holidayError: problem });
	requestHoliday(season.id, user.id, r);
	postToOrganizers(holidayEmbed({
		player: user.displayName,
		dates: dateSpan(r.from, r.to),
		covers: coversLabel(holidayWeeks(r, cal), season.roundsPerWeek, maxRound),
		where: season.name,
		url: `${event.url.origin}/seasons/${season.slug}/admin/season#holidays`
	}));
	return { message: `Holiday requested for ${dateSpan(r.from, r.to)}. An organizer will look at it.` };
},

cancelHoliday: async (event) => {
	const user = playerAction(event);
	const id = Number((await event.request.formData()).get('id'));
	const season = publicSeason(event.params.slug, user);
	if (!cancelHoliday(season.id, id, user.id)) return fail(409, { message: 'That request is no longer pending.' });
	return { message: 'Request cancelled.' };
}
```

`+page.svelte` (HolidayPlayer / HolidayMobilePlayer boards; layout already responsive):

- In `.name-row` after the Career link, when `data.canRequest`: `ConfirmButton action="?/requestHoliday" variant="ghost" small label="Going away?" title="Going away?" confirmLabel="Request holiday" confirmDisabled={!!problem}`. Body: `<p>Your matches in those weeks unlock now, so you can play them before you go. An organizer approves it.</p>`, two `<label class="pb-field">First day away <input class="pb-input" type="date" name="from" min={cal.today} max={cal.deadline} bind:value={from} /></label>` (and "Last day away"), then `<p aria-live="polite" class="muted small">Covers {covers}.</p>` or `<p role="alert" class="small">{problem}</p>`, where `problem = requestError({ from, to }, cal, cal.own)` and `covers = coversLabel(holidayWeeks({ from, to }, cal), …)` (`$derived`). Show `form?.holidayError` as `<p class="pb-notice" role="alert">`.
- After the head section, one `<section class="panel holiday" aria-labelledby="hol-{h.id}">` per `data.holidays` entry:

| status   | h2                   | badge                                 | text                                                                                                                                     | extra                                                                                                                                                                                                                                            |
| -------- | -------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pending  | Holiday requested    | `pb-badge` Pending                    | `{away} · covers {covers}. An organizer will look at it.`                                                                                | `ConfirmButton action="?/cancelHoliday" fields={{ id }} variant="secondary" label="Cancel request" title="Cancel your holiday request?" confirmLabel="Cancel request"`, body "Your matches stay in their normal weeks. You can ask again later." |
| approved | Holiday approved     | `pb-badge pb-badge-win` Approved      | `You’re away {away} · covers {covers}. These matches are unlocked now. Results stay out of the standings until their week is published.` | —                                                                                                                                                                                                                                                |
| rejected | Holiday not approved | `pb-badge pb-badge-loss` Not approved | `Your request for {away} wasn’t approved.`                                                                                               | if `reason`: `<figure class="reason"><figcaption>Organizer’s reason</figcaption><blockquote>“{reason}”</blockquote></figure>`                                                                                                                    |
| revoked  | Holiday revoked      | `pb-badge pb-badge-loss` Revoked      | `Your holiday for {away} was revoked. Matches already unlocked stay unlocked.`                                                           | —                                                                                                                                                                                                                                                |

- Scoped styles: `.holiday { display:flex; flex-direction:column; gap:14px }`, `.reason { margin:0; border-left:3px solid var(--line); padding:2px 0 2px 12px }`, caption in the eyebrow style (reuse `.eyebrow`).

- [ ] **Step 4:** `npx vitest run && npm run check` → PASS.
- [ ] **Step 5:** Commit.

```bash
git add src/lib/discord.ts src/lib/discord.spec.ts src/lib/server/holidays.spec.ts "src/routes/seasons/[slug]/players/[id]"
git commit -m "feat(holiday): players request and cancel a holiday on their page"
```

---

### Task 6: Organizers approve, reject and revoke

**Files:**

- Modify `src/routes/seasons/[slug]/admin/season/+page.server.ts`, `+page.svelte`
- Modify `src/lib/components/PlayerName.svelte` (`tag` prop)
- Test: `src/lib/server/holidays.spec.ts`

- [ ] **Step 1: Failing tests** (`seasonActions` from the admin season route; `auth.ts` mocked like `actions.spec.ts`):
  - `approveHoliday` on a pending holiday → `{ message: 'Holiday approved for Player 1. It’s in the audit log.' }`, status approved, one `holiday` audit row; second submit → 409; on an approved one → 409.
  - `rejectHoliday` with `reason` (trimmed, ≤ 500 chars else 400) → rejected, reason stored, audit row without it; without a reason → reason null.
  - `revokeHoliday` only on approved → revoked; pending → 409.
  - All three: non-organizer → redirect `/login/not-organizer`; season not in play → 409; holiday of another season or junk id → 404.
  - Load: `holidays.pending` / `holidays.approved` rows with `name`, `away`, `covers`, `asked` (`date()` of `createdAt`), approved rows also `early: '1 of 2 played'` (unlocked matches of that player still unpublished: reported / total) and `decided`; `holidays` is `null` outside play.

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** in `admin/season/+page.server.ts`:

```ts
// load, inside the play branch (d = seasonData(season.id)):
holidays: d && holidayAdmin(season, d.all),
```

`holidayAdmin` in `src/lib/server/holidays.ts`:

```ts
export function holidayAdmin(season: Season, all: Match[]) {
	const list = seasonHolidays(season.id);
	const maxRound = Math.max(0, ...all.map((m) => m.round));
	const cal = { startDate: season.startDate ?? '', roundsPerWeek: season.roundsPerWeek, maxRound };
	const { unlocked } = seasonUnlocks(season, list);
	const row = (h: SeasonHoliday) => ({
		id: h.id,
		player: {
			name: h.name,
			avatar: h.avatar,
			former: h.former,
			href: `/seasons/${season.slug}/players/${h.playerId}`
		},
		away: dateSpan(h.from, h.to),
		covers: coversLabel(holidayWeeks(h, cal), season.roundsPerWeek, maxRound),
		asked: date(leagueDate(h.createdAt))
	});
	return {
		pending: list.filter((h) => h.status === 'pending').map(row),
		approved: list
			.filter((h) => h.status === 'approved')
			.map((h) => {
				const early = all.filter(
					(m) => (m.p1Id === h.playerId || m.p2Id === h.playerId) && isUnlocked(m, season, unlocked)
				);
				return {
					...row(h),
					early: `${early.filter((m) => m.reportedBy).length} of ${early.length} played`,
					decided: h.decidedAt ? date(leagueDate(h.decidedAt)) : ''
				};
			})
	};
}
```

Actions (one helper, three names):

```ts
async function decide(event: Parameters<Actions[string]>[0], from: 'pending' | 'approved', to: 'approved' | 'rejected' | 'revoked') {
	const user = await organizerAction(event);
	const form = await event.request.formData();
	const season = getSeason(event.params.slug, user);
	const h = getHoliday(season.id, Number(form.get('id'))) ?? error(404, 'Holiday not found');
	if (season.status !== 'play') return fail(409, { message: 'Holidays only change while the season is in play.' });
	if (h.status !== from) return fail(409, { message: 'That holiday was already decided.' });
	const reason = String(form.get('reason') ?? '').trim();
	if (reason.length > 500) return fail(400, { message: 'Keep the reason under 500 characters.' });
	decideHoliday(h, user.id, to, reason);
	const name = seasonEntries(season.id).find((e) => e.playerId === h.playerId)?.displayName ?? 'the player';
	const verb = { approved: 'approved for', rejected: 'rejected for', revoked: 'revoked for' }[to];
	return { message: `Holiday ${verb} ${name}. It’s in the audit log.` };
}
approveHoliday: (e) => decide(e, 'pending', 'approved'),
rejectHoliday: (e) => decide(e, 'pending', 'rejected'),
revokeHoliday: (e) => decide(e, 'approved', 'revoked'),
```

`PlayerName.svelte`: add `tag?: string | null` and render `{#if tag}<span class="pb-badge pb-badge-sm">{tag}</span>{/if}` before `{@render children?.()}`.

`admin/season/+page.svelte` (HolidayAdmin board), between the season form and End of season, only when `data.holidays`:

```svelte
<section id="holidays" aria-labelledby="hol-h">
	<h2 id="hol-h">Holidays</h2>
	<p class="muted">
		Approving unlocks the player’s matches in those weeks, so they can play them before they go.
		Results played early stay out of the standings until that week is published.
	</p>
	<div class="panel table-wrap">
		<h3>Waiting for you · {data.holidays.pending.length}</h3>
		{#if data.holidays.pending.length}
			<table class="pb-table">
				<thead
					><tr
						><th>Player</th><th>Away</th><th>Covers</th><th>Asked</th><th
							><span class="pb-sr">Actions</span></th
						></tr
					></thead
				>
				<tbody
					>{#each data.holidays.pending as r (r.id)}<tr>
							<td><PlayerName {...r.player} /></td><td class="mono">{r.away}</td><td>{r.covers}</td
							><td class="mono muted">{r.asked}</td>
							<td class="acts">
								<ConfirmButton
									action="?/approveHoliday"
									fields={{ id: String(r.id) }}
									small
									label="Approve"
									title="Approve {r.player.name}’s holiday?"
									confirmLabel="Approve"
									>{r.player.name} is away {r.away}, {r.covers}. Those matches unlock now for them
									and their opponents.</ConfirmButton
								>
								<ConfirmButton
									action="?/rejectHoliday"
									fields={{ id: String(r.id) }}
									small
									variant="secondary"
									label="Reject"
									title="Reject {r.player.name}’s holiday?"
									confirmLabel="Reject"
								>
									<p>Their matches stay in their normal weeks.</p>
									<label class="pb-field"
										>Reason (optional)<input class="pb-input" name="reason" maxlength="500" /><span
											class="muted small">{r.player.name} sees this on their page.</span
										></label
									>
								</ConfirmButton>
							</td></tr
						>{/each}</tbody
				>
			</table>
		{:else}<p class="muted">No requests waiting.</p>{/if}
	</div>
	<div class="panel table-wrap">
		<h3>Approved · {data.holidays.approved.length}</h3>
		<!-- Player (PlayerName tag="On holiday"), Away, Covers, Early matches, Approved, Revoke:
		     ConfirmButton action="?/revokeHoliday" label="Revoke" title="Revoke {name}’s holiday?" confirmLabel="Revoke holiday",
		     body "The On holiday badge goes. Matches already unlocked stay unlocked." -->
		<!-- empty: "Nobody is on holiday this season." -->
	</div>
</section>
```

`.table-wrap { overflow-x: auto }` so phones scroll the table, not the page (mobile.spec allows scrollers that fit). Show `form?.message` in the page's existing notice.

- [ ] **Step 4:** `npx vitest run && npm run check` → PASS.
- [ ] **Step 5:** Commit.

```bash
git add src/lib/server src/lib/components/PlayerName.svelte "src/routes/seasons/[slug]/admin/season"
git commit -m "feat(holiday): organizers approve, reject and revoke holidays"
```

---

### Task 7: Unlocked matches: see, report, edit

**Files:**

- Modify `src/lib/matchCard.ts`, `src/lib/matchCard.spec.ts` (`publishedRound` on `CardSeason`, early note)
- Modify `src/routes/seasons/[slug]/matches/[id]/+page.server.ts`
- Modify `src/routes/seasons/[slug]/players/[id]/+page.server.ts`, `+page.svelte`
- Modify `src/lib/server/resultActions.ts`
- Modify `src/routes/seasons/[slug]/admin/matches/+page.server.ts`, `+page.svelte`
- Test: `src/lib/server/holidays.spec.ts`, `src/lib/matchCard.spec.ts`, existing `actions.spec.ts` / `pages.spec.ts` must stay green

- [ ] **Step 1: Failing tests.**

`matchCard.spec.ts` (add `publishedRound: 1` to the fixture season):

```ts
it('notes an early match until its week is published', () => {
	const s = { ...season, publishedRound: 1, roundsPerWeek: 2 };
	expect(matchCard(match({ round: 3 }), ctx('p1', s)).props.note).toBe('Unlocked early');
	expect(matchCard(match({ round: 3, ...reported }), ctx('p1', s)).props.note).toBe(
		'Played early, hidden from standings until week 2 is published'
	);
	expect(matchCard(match({ round: 1, ...reported }), ctx('p1', s)).props.note).toMatch(
		/^Reported by/
	);
});
```

`holidays.spec.ts` — season: p1–p4 one group, rounds 1–3, `roundsPerWeek: 2`, `publishedRound: 2`, `startDate: '2026-10-05'`; `m13` = round 3 p1 vs p4, `m23` = round 3 p2 vs p3; p1 approved holiday 12–14 Oct (week 2):

- match page load: p1 and p4 → 200 with `mode: 'report'`; p2, logged out → 404; organizer (session `isOrganizer`, `currentRole` mocked true) → 200, `mode: 'view'`; `m23` → 404 for everyone; same holiday `pending` or `rejected` → 404 for p1.
- after `revokeHoliday`: p1 still gets 200 `mode: 'report'`.
- report by p4 → saved, `postResult` **not** called, message `Result saved. It stays hidden from everyone else until week 2 is published.`; flag by p1 → `postToOrganizers` called once.
- player page load of p1 viewed by p1 → `early` = [m13 card], `matches` has no round 3; viewed by p4 → [m13]; viewed by p2 / logged out → []; p4's page viewed by p4 → [m13]; p4's page viewed by p1 → [m13]; p2's page viewed by p1 → [].
- schedule load for p1, `week=2` → no cards (still unpublished).
- organizer `editResult` on `m13` (unreported) → saved, `postToOrganizers` once, `postResult` never; on `m23` → 409 `Publish this week before entering results.`
- admin matches load → `unlocked` contains m13 only.

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**

`matchCard.ts`: `CardSeason` gains `publishedRound: number`; in `matchCard`:

```ts
const early = !isPublished(m, c.season.publishedRound);
const week = weekOf(m.round, c.season.roundsPerWeek);
…
note: voided
	? 'Void: a player dropped'
	: walkover
		? `Walkover · ${walkover} advances`
		: early
			? m.reportedBy
				? `Played early, hidden from standings until week ${week} is published`
				: 'Unlocked early'
			: m.reportedBy
				? `Reported by ${person(m.reportedBy)?.displayName ?? 'an organizer'}`
				: '',
```

`matches/[id]/+page.server.ts`:

```ts
function context({ params, locals }: Event, organizer = false) {
	const season = getSeason(params.slug, locals.user);
	const id = Number(params.id);
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	// Unpublished pairings stay secret, except a holiday's early match for its two players and organizers.
	const { unlocked } = seasonUnlocks(season);
	if (!match || !(visibleTo(match, locals.user?.id ?? null, season, unlocked) || (organizer && isUnlocked(match, season, unlocked))))
		error(404, 'Match not found');
	…
}

export const load: PageServerLoad = async (event) => {
	// Only an organizer looking at an early match needs the role; currentRole re-checks it with Discord at most once a minute.
	const organizer = !!event.locals.user?.isOrganizer && (await currentRole(event));
	const { … } = context(event, organizer);
	…
};
```

Report action, after `saveReport`:

```ts
const post = matchPost(event.url.origin, season, match, parsed.values);
const opponent = user.id === post.p1.id ? post.p2 : post.p1;
// An early result posts when its week is published.
if (!isPublished(match, season.publishedRound))
	return {
		message: `Result saved. It stays hidden from everyone else until week ${weekOf(match.round, season.roundsPerWeek)} is published.`
	};
postResult(resultEmbed(post));
return { message: `Result saved. If something's off, you or ${opponent.name} can flag it.` };
```

`resultActions.ts` `editResult`:

```ts
const early = !isPublished(match, season.publishedRound);
if (early && !isUnlocked(match, season, seasonUnlocks(season).unlocked))
	return fail(409, { message: 'Publish this week before entering results.' });
…
organizerEdit(match, user.id, parsed.values);
const post = matchPost(event.url.origin, season, match, parsed.values);
// Early results reach the results channel when their week is published; organizers hear now.
if (!match.reportedBy && !early) postResult(resultEmbed(post));
else postToOrganizers(organizerEditEmbed(post, user.displayName, { resolves, kept: false }));
```

(Keep the existing order: `target()` reads everything before the write; `seasonUnlocks` is a sync read with no await in between.)

`players/[id]/+page.server.ts`:

```ts
const { unlocked } = seasonUnlocks(season, hs);
const viewer = locals.user?.id ?? null;
const early = playerMatches(season.id, player.playerId).filter((m) => !isPublished(m, season.publishedRound) && visibleTo(m, viewer, season, unlocked));
…
early: early.map((m) => matchCard(m, ctx)),
```

`+page.svelte`: after the stats section, when `data.early.length`: `<section aria-labelledby="early-h"><h2 id="early-h">Unlocked early</h2><p class="muted">Unlocked for a holiday. Results stay hidden from everyone else until their week is published.</p><div class="cards">{#each data.early as c (c.id)}<MatchCard {...c.props} />{/each}</div></section>`. (Stats tiles and legends keep using published matches only.)

`admin/matches`: load returns `unlocked: matchesOf(...).filter(isUnlocked).map(id)` (as an array); svelte:

```svelte
{#if r.round > data.publishedRound && !data.unlocked.includes(r.id)}
	<span class="muted small">Unpublished</span>
{:else if data.canEdit && r.status !== 'void'}
	{#if r.round > data.publishedRound}<span class="muted small">Unlocked early</span>{/if}
	<ResultActions row={r} query="status={data.filter}" />
{/if}
```

- [ ] **Step 4:** `npx vitest run && npm run check` → PASS (the existing "hides unpublished rounds, organizers included" tests still pass: no holiday there).
- [ ] **Step 5:** Commit.

```bash
git add src/lib "src/routes/seasons/[slug]"
git commit -m "feat(holiday): players see and report their unlocked matches early"
```

---

### Task 8: "On holiday" badge and pairing tags

**Files:**

- Modify `src/lib/matchCard.ts`, `src/lib/matchCard.spec.ts`, `src/lib/components/MatchCard.svelte`
- Modify `src/routes/seasons/[slug]/players/[id]/+page.server.ts`, `+page.svelte`, `schedule/+page.server.ts`, `+page.server.ts`, `matches/[id]/+page.server.ts`
- Test: `src/lib/matchCard.spec.ts`, `src/lib/server/holidays.spec.ts`

- [ ] **Step 1: Failing tests.**

```ts
it('tags a player on an approved holiday in that week', () => {
	const away = new Map([['p1', new Set([2])]]);
	const s = { ...season, roundsPerWeek: 2 };
	const c = cardContext(s, people, null, NOW, 0, away);
	expect(matchCard(match({ round: 3 }), c).props.sides.map((x) => x.tag)).toEqual([
		'On holiday',
		null
	]);
	expect(matchCard(match({ round: 1 }), c).props.sides[0].tag).toBeNull();
});
```

Server: p1's page `away` = `{ dates: '12–14 Oct' }` when today (fake timers) is in week 2 and the holiday is approved; `null` in week 1, after revoke, and for a pending one. Schedule load after publishing week 2 → p1's card side has `tag: 'On holiday'`.

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**

`matchCard.ts`: `cardContext(season, people, viewerId, now = new Date(), cutRounds = 0, away: WeekMap = new Map())`, store `away` on the context; `side()` adds `tag: c.away.get(id)?.has(weekOf(m.round, c.season.roundsPerWeek)) ? 'On holiday' : null` (playoffs: skip, `m.stage === 'playoff' ? null : …`).

`MatchCard.svelte`: `Side` gets `tag?: string | null`; after the name link: `{#if s.tag}<span class="pb-badge pb-badge-sm">{s.tag}</span>{/if}`.

Pass `seasonUnlocks(season).away` as the 6th argument in `schedule/+page.server.ts`, `seasons/[slug]/+page.server.ts` (the `ctx` one), `players/[id]/+page.server.ts`, `matches/[id]/+page.server.ts`. `adminRows` and the top-cut page keep the default.

Player page head: load returns

```ts
away: (() => {
	const h = hs.find((h) => h.playerId === player.playerId && h.status === 'approved' && holidayWeeks(h, { startDate: season.startDate ?? '' }).includes(ctx.week));
	return h ? { dates: dateSpan(h.from, h.to) } : null;
})(),
```

and the badges row renders `{#if data.away}<span class="pb-badge">On holiday</span><span class="muted small">{data.away.dates}</span>{/if}`.

- [ ] **Step 4:** `npx vitest run && npm run check` → PASS.
- [ ] **Step 5:** Commit.

```bash
git add src/lib "src/routes/seasons/[slug]"
git commit -m "feat(holiday): On holiday badge on player pages and pairings"
```

---

### Task 9: Publishing a week posts its early results

**Files:**

- Modify `src/lib/server/seasonAdmin.ts` (`nextPairings` returns `reported`)
- Modify `src/routes/seasons/[slug]/admin/+page.server.ts` (publish action)
- Test: `src/lib/server/holidays.spec.ts`

- [ ] **Step 1: Failing test.**

```ts
it('publish posts each reported match of the published rounds, once', async () => {
	// m13 reported early by p4; m23 unreported; a dropped player's match in round 3 reported → void, not posted
	await outcome(adminActions.publish!(event({ slug: 's1' }, ORG, { week: '2' })));
	expect(hooks.postResult).toHaveBeenCalledOnce();
	expect(hooks.postResult.mock.calls[0][0].title).toBe('Player 1 0–2 Player 4');
	expect(auditLines(season.id, { publishedRound: 3 }).some((l) => l.action === 'report')).toBe(
		true
	);
	expect(
		groupStandings({ ...season, publishedRound: 3 }, seasonEntries(season.id))[0].rows.find(
			(r) => r.playerId === 'p4'
		)!.points
	).toBe(3);
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**

`seasonAdmin.ts` `nextPairings`:

```ts
// Results reported early (holiday mode) post when their round is published.
reported: live.filter((m) => m.reportedBy && m.round >= first && m.round <= last),
```

Publish action, after `publishWeek(...)` and the pairings post:

```ts
for (const m of p.reported)
	postResult(resultEmbed(matchPost(event.url.origin, season, m, resultOf(m)!)));
```

- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit.

```bash
git add src/lib/server/seasonAdmin.ts "src/routes/seasons/[slug]/admin/+page.server.ts" src/lib/server/holidays.spec.ts
git commit -m "feat(holiday): publishing a week posts its early results"
```

---

### Task 10: e2e — the whole flow, and phones

**Files:**

- Create `e2e/holiday.spec.ts`
- Modify `e2e/fixtures.ts` (`holiday: 'e2e-holiday'`), `e2e/db.ts` (`seedHoliday`), `e2e/mobile.spec.ts`

- [ ] **Step 1:** `e2e/db.ts`:

```ts
// A holiday request as the site stores it; approved ones get the organizer as decider.
export const seedHoliday = (
	key: SeasonKey,
	n: number,
	from: string,
	to: string,
	status = 'pending'
) =>
	write((db) =>
		db
			.prepare(
				`insert into holidays (season_id, player_id, from_date, to_date, status, decided_by, decided_at)
			 select id, ?, ?, ?, ?, iif(? = 'pending', null, ?), iif(? = 'pending', null, unixepoch()) from seasons where slug = ?`
			)
			.run(player(key, n), from, to, status, status, ORGANIZER, status, SEASONS[key])
	);
```

- [ ] **Step 2: Write `e2e/holiday.spec.ts`.** Season: `seedSeason('holiday', { publishedRound: 2, startDate: day(-3), deadline: day(20) })` → week 1 = R1–2 (published), week 2 = R3 (`day(4)`…`day(10)`, unpublished). `ids[4]` = R3 Holiday 1 vs Holiday 4, `ids[5]` = R3 Holiday 2 vs Holiday 3. `afterAll(removeSeason('holiday'))`.

```ts
test('request → approve → early report stays hidden → publish posts it', async ({ browser }) => {
	const p1 = await browser.newPage(as(player('holiday', 1)));
	await p1.goto(`/seasons/${slug}/players/${player('holiday', 1)}`);
	await p1.getByRole('button', { name: 'Going away?' }).click();
	const ask = p1.getByRole('dialog', { name: 'Going away?' });
	await ask.getByLabel('First day away').fill(day(5));
	await ask.getByLabel('Last day away').fill(day(7));
	await expect(ask.getByText('Covers week 2 (round 3).')).toBeVisible();
	await ask.getByRole('button', { name: 'Request holiday' }).click();
	await expect(p1.getByRole('status')).toContainText('Holiday requested');
	await expect(p1.getByRole('heading', { name: 'Holiday requested' })).toBeVisible();
	await expect
		.poll(async () =>
			(await posts('organizers')).some((b) => b.embeds?.[0].title === 'Holiday request: Holiday 1')
		)
		.toBe(true);

	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/admin/season`);
	await org
		.getByRole('row', { name: /Holiday 1/ })
		.getByRole('button', { name: 'Approve' })
		.click();
	await org.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday approved for Holiday 1');

	// Both players see the round 3 match; nobody else does.
	await p1.reload();
	await expect(p1.getByRole('heading', { name: 'Holiday approved' })).toBeVisible();
	await expect(
		p1.getByRole('region', { name: 'Unlocked early' }).getByText('Holiday 4')
	).toBeVisible();
	for (const id of [player('holiday', 2), null]) {
		const other = id ? await browser.newPage(as(id)) : await browser.newPage();
		expect((await other.goto(`/seasons/${slug}/matches/${early}`))?.status()).toBe(404);
	}

	// Holiday 4 reports it through the form (2–0 to Holiday 4).
	const p4 = await browser.newPage(as(player('holiday', 4)));
	await p4.goto(`/seasons/${slug}/matches/${early}`);
	const game = (n: number) => p4.getByRole('radiogroup', { name: new RegExp(`^Game ${n}`) });
	await p4.getByLabel('Legend').nth(0).selectOption('Ahri');
	await p4.getByLabel('Legend').nth(1).selectOption('Annie');
	await p4.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel('Holiday 4').check();
	await game(1).getByLabel('Holiday 4').check();
	await game(2).getByLabel('Holiday 4').check();
	await p4.getByRole('button', { name: 'Add result' }).click();
	await p4.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(p4.getByRole('status')).toContainText(
		'It stays hidden from everyone else until week 2 is published'
	);

	// Hidden: standings (API), public audit log, results channel.
	const standings = async () =>
		(
			await (await fetch(`http://localhost:${PORT}/api/v1/seasons/${slug}`)).json()
		).groups[0].standings.map((r: { played: number }) => r.played);
	expect(await standings()).toEqual([0, 0, 0, 0]);
	const visitor = await browser.newPage();
	await visitor.goto(`/seasons/${slug}/audit`);
	await expect(visitor.getByText('Holiday 1 — holiday')).toBeVisible();
	await expect(visitor.getByText(/Holiday 1 0–2 Holiday 4/)).toHaveCount(0);
	expect((await posts('results')).some((b) => b.embeds?.[0].title.includes('Holiday 4'))).toBe(
		false
	);

	// Publish week 2: the result shows and posts once.
	await org.goto(`/seasons/${slug}/admin`);
	await org.getByRole('button', { name: 'Publish week 2' }).click();
	await org.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
	await expect
		.poll(
			async () =>
				(await posts('results')).filter((b) => b.embeds?.[0].title === 'Holiday 1 0–2 Holiday 4')
					.length
		)
		.toBe(1);
	await expect.poll(standings).toContainEqual(1);
	await visitor.goto(`/seasons/${slug}/matches/${early}`);
	await expect(
		visitor.getByRole('heading', { level: 1, name: 'Holiday 1 vs Holiday 4' })
	).toBeVisible();
	await expect(visitor.getByText('On holiday').first()).toBeVisible();
});

test('reject with a reason only the player sees; cancel; revoke keeps the match', async ({
	browser
}) => {
	const [h2, h3] = [player('holiday', 2), player('holiday', 3)];
	seedHoliday('holiday', 2, day(5), day(6));
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/admin/season`);
	await org
		.getByRole('row', { name: /Holiday 2/ })
		.getByRole('button', { name: 'Reject' })
		.click();
	const dlg = org.getByRole('dialog', { name: 'Reject Holiday 2’s holiday?' });
	await dlg.getByLabel('Reason (optional)').fill('Ask a week ahead.');
	await dlg.getByRole('button', { name: 'Reject' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday rejected for Holiday 2');

	const p2 = await browser.newPage(as(h2));
	await p2.goto(`/seasons/${slug}/players/${h2}`);
	await expect(p2.getByRole('heading', { name: 'Holiday not approved' })).toBeVisible();
	await expect(p2.getByText('“Ask a week ahead.”')).toBeVisible();
	const p3 = await browser.newPage(as(h3));
	await p3.goto(`/seasons/${slug}/players/${h2}`);
	await expect(p3.getByText('Ask a week ahead.')).toHaveCount(0);
	await p3.goto(`/seasons/${slug}/audit`);
	await expect(p3.getByText(/Holiday 2 — holiday .* rejected/)).toBeVisible();
	await expect(p3.getByText('Ask a week ahead.')).toHaveCount(0);

	// Holiday 3 asks, then cancels: the card goes, nothing is logged.
	await p3.goto(`/seasons/${slug}/players/${h3}`);
	await p3.getByRole('button', { name: 'Going away?' }).click();
	const ask = p3.getByRole('dialog', { name: 'Going away?' });
	await ask.getByLabel('First day away').fill(day(5));
	await ask.getByLabel('Last day away').fill(day(6));
	await ask.getByRole('button', { name: 'Request holiday' }).click();
	await p3.getByRole('button', { name: 'Cancel request' }).click();
	await p3.getByRole('dialog').getByRole('button', { name: 'Cancel request' }).click();
	await expect(p3.getByRole('status')).toHaveText('Request cancelled.');
	await expect(p3.getByRole('heading', { name: 'Holiday requested' })).toHaveCount(0);

	// Approved, then revoked: the badge goes, the round 3 match (Holiday 2 vs Holiday 3) still opens.
	seedHoliday('holiday', 3, day(5), day(6), 'approved');
	await org.reload();
	await org
		.getByRole('row', { name: /Holiday 3/ })
		.getByRole('button', { name: 'Revoke' })
		.click();
	await org.getByRole('dialog').getByRole('button', { name: 'Revoke holiday' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday revoked for Holiday 3');
	await p3.reload();
	await expect(p3.getByRole('heading', { name: 'Holiday revoked' })).toBeVisible();
	expect((await p3.goto(`/seasons/${slug}/matches/${other}`))?.status()).toBe(200);
});
```

`other = ids[5]` (R3 Holiday 2 vs Holiday 3). `test.describe.configure({ mode: 'serial' })` and put this test **first**: the flow test publishes week 2 at its end, which would make this one's unpublished checks meaningless. Holiday 1's request (day 5–7) doesn't overlap anything Holiday 2/3 hold, and the 1v4 match is untouched here.

- [ ] **Step 3: Mobile.** In `mobile.spec.ts` `beforeAll`: `seedHoliday('mobile', 1, day(1), day(5), 'approved')` and `seedHoliday('mobile', 3, day(1), day(5))` so the player page shows the approved card and Admin → Season shows both tables. Pages already listed (`${s}/players/${me}`, `${s}/admin/season`) cover them.
- [ ] **Step 4:** `npm run test:e2e -- holiday.spec.ts mobile.spec.ts` → PASS. Break the fix once (e.g. drop the `isPublished` mask in `groupStandings`) and watch the hidden-standings assertion fail, then restore.
- [ ] **Step 5:** Commit.

```bash
git add e2e
git commit -m "test(holiday): request, approve, early report and publish end to end"
```

---

### Task 11: Dev data

**Files:**

- Modify `scripts/reseed-dev.ts`, `scripts/report-dev.ts`
- Create `scripts/holiday-dev.ts`
- Modify `package.json` (`"db:holiday-dev": "node scripts/holiday-dev.ts"`), `README.md`

- [ ] **Step 1: `reseed-dev.ts`.**
  - Wipe: `delete from holidays;` first; add `'holidays'` to the `sqlite_sequence` list.
  - After the drop/erase block (so dropped and erased players are excluded), Autumn 2026 (start 5 Oct, published 8 → week 5 = 2–8 Nov R9–10, week 6 = 9–15 Nov R11):

```ts
const addHoliday = db.prepare(
	`insert into holidays (season_id, player_id, from_date, to_date, status, decided_by, decided_at, created_at)
	 values (?, ?, ?, ?, ?, ?, ?, ?) returning id`
);
const holidayLog = (who: string, from: string, to: string, status: string, t: number) =>
	log.run(
		autumn.sid,
		null,
		ME,
		'holiday',
		null,
		JSON.stringify({ holiday: who, from, to, status }),
		t
	);
const asked = at('2026-10-05', 7); // during week 4
const [pendingId, earlyId, revokedId] = shuffle(
	(
		db
			.prepare(
				`select player_id as id from entries where season_id = ? and dropped = 0 and player_id <> ? and player_id like 'dev%'`
			)
			.all(autumn.sid, ME) as { id: string }[]
	).map((r) => r.id)
);
// You: approved for week 5, so your round 9 and 10 matches are unlocked (you haven't played them).
addHoliday.run(autumn.sid, ME, '2026-11-02', '2026-11-08', 'approved', ME, asked + 3600, asked);
holidayLog(ME, '2026-11-02', '2026-11-08', 'approved', asked + 3600);
// Pending, for the approve/reject buttons.
addHoliday.run(autumn.sid, pendingId, '2026-11-09', '2026-11-15', 'pending', null, null, asked);
// Approved for week 6 with its round 11 result already reported: hidden until week 6 is published.
addHoliday.run(
	autumn.sid,
	earlyId,
	'2026-11-09',
	'2026-11-15',
	'approved',
	ME,
	asked + 7200,
	asked
);
holidayLog(earlyId, '2026-11-09', '2026-11-15', 'approved', asked + 7200);
const r11 = autumn.ms.find(
	(m) =>
		m.round === 11 &&
		(m.a === earlyId || m.b === earlyId) &&
		m.a !== ME &&
		m.b !== ME &&
		m.a !== dropped &&
		m.b !== dropped &&
		m.a !== erased &&
		m.b !== erased
);
if (r11) {
	/* report it like the season() loop: report.run(...), log.run(... 'report' ...) with t = at('2026-10-05', 8) */
}
// Revoked: the badge is gone, the week 5 matches stay unlocked.
addHoliday.run(
	autumn.sid,
	revokedId,
	'2026-11-02',
	'2026-11-08',
	'revoked',
	ME,
	asked + 10800,
	asked
);
holidayLog(revokedId, '2026-11-02', '2026-11-08', 'approved', asked + 9000);
holidayLog(revokedId, '2026-11-02', '2026-11-08', 'revoked', asked + 10800);
```

- Header comment: add "holidays: yours approved (week 5), one pending, one approved with a hidden early result, one revoked". Add `sum(...)` of holidays to the final `console.table` or a second `console.table` of `select status, count(*) from holidays group by status`.

- [ ] **Step 2: `scripts/holiday-dev.ts`.**

```ts
// Dev only: a pending holiday request for a fake player (random if none given), covering the next
// unpublished week, to test approve/reject from scratch. Same limits as the site; posts nothing to Discord.
import Database from 'better-sqlite3';
import { requestError, type HolidayStatus } from '#lib/league/holiday.ts';
import { addDays, leagueDate, roundsOfWeek, weekOf } from '#lib/league/time.ts';

process.loadEnvFile();
const [slug, who] = process.argv.slice(2);
if (!slug) throw new Error('usage: npm run db:holiday-dev -- <season-slug> [player-id]');
const db = new Database(process.env.DATABASE_URL!);
const s = db
	.prepare(
		`select id, status, start_date as startDate, rounds_per_week as roundsPerWeek, published_round as publishedRound, deadline
	 from seasons where slug = ? and deleted_at is null`
	)
	.get(slug) as
	| {
			id: number;
			status: string;
			startDate: string;
			roundsPerWeek: number;
			publishedRound: number;
			deadline: string | null;
	  }
	| undefined;
if (!s) throw new Error(`No season with slug "${slug}"`);
if (s.status !== 'play')
	throw new Error(`"${slug}" isn't in play; holidays are only for the weeks of play.`);
const maxRound = (
	db
		.prepare(`select max(round) n from matches where season_id = ? and stage = 'group'`)
		.get(s.id) as { n: number }
).n;
const week = weekOf(s.publishedRound, s.roundsPerWeek) + 1;
if (!roundsOfWeek(week, s.roundsPerWeek, maxRound))
	throw new Error(`Every week of "${slug}" is published.`);
const today = leagueDate(new Date());
const start = addDays(s.startDate, (week - 1) * 7);
const from = start > today ? start : today;
const end = addDays(s.startDate, week * 7 - 1);
const to = s.deadline && s.deadline < end ? s.deadline : end;
const cal = { ...s, maxRound, today };
const own = (id: string) =>
	db
		.prepare(
			`select from_date as "from", to_date as "to", status from holidays where season_id = ? and player_id = ?`
		)
		.all(s.id, id) as { from: string; to: string; status: HolidayStatus }[];
const fakes = (
	db
		.prepare(
			`select player_id as id from entries where season_id = ? and dropped = 0 and player_id like 'dev%'`
		)
		.all(s.id) as { id: string }[]
).map((r) => r.id);
const pool = who
	? [who]
	: fakes.filter((id) => !requestError({ from, to }, cal, own(id))).sort(() => Math.random() - 0.5);
const id = pool[0];
if (!id) throw new Error(`No fake player in "${slug}" can ask for ${from}–${to}.`);
if (!fakes.includes(id) && !who) throw new Error(`${id} isn't a fake player in "${slug}".`);
const problem = requestError({ from, to }, cal, own(id));
if (problem) throw new Error(problem);
db.prepare(
	`insert into holidays (season_id, player_id, from_date, to_date) values (?, ?, ?, ?)`
).run(s.id, id, from, to);
console.log(
	`Pending holiday for ${id}: ${from} to ${to} (week ${week}). Approve or reject it in Admin → Season.`
);
```

If `who` is given, check it has an entry in the season (`select 1 from entries …`) instead of requiring a fake id.

- [ ] **Step 3: `report-dev.ts`** — mirror the site: refuse a match players can't see yet unless a holiday unlocked it.

```ts
import { isUnlocked, unlockedWeeks, type Holiday } from '#lib/league/holiday.ts';
…
const s = db.prepare('select published_round as publishedRound, rounds_per_week as roundsPerWeek, start_date as startDate from seasons where id = ?').get(m.season_id) as …;
const hs = db.prepare(`select player_id as playerId, from_date as "from", to_date as "to", status from holidays where season_id = ?`).all(m.season_id) as Holiday[];
const match = { round: m.round, p1Id: m.p1_id, p2Id: m.p2_id };
if (m.round > s.publishedRound && !isUnlocked(match, s, unlockedWeeks(hs, s.startDate)))
	throw new Error(`Match ${id} isn't published or unlocked by a holiday yet`);
```

(add `round` to the selected match type). Header comment: "works on holiday-unlocked matches, so your opponent can report one early".

- [ ] **Step 4: README** → Fake players list, new item after `db:report-dev`:
      `npm run db:holiday-dev -- <slug> [player-id]` adds a pending holiday request for a fake player (random if omitted) covering the next unpublished week, to test approving and rejecting in **Admin → Season → Holidays**.
      Extend the `db:report-dev` line: "also works on a match unlocked early by a holiday". Reseed line: "…the in-play season has holidays in every state, yours approved for the next unpublished week". Commands table: add `db:holiday-dev`.
- [ ] **Step 5: Check by hand (dev DB only, never prod):** `npm run db:reseed-dev -- <your-discord-id>`; `npm run db:holiday-dev -- autumn-2026`; `npm run db:report-dev -- <your round 9 match id> <your-discord-id>` succeeds; a round 11 match of yours not unlocked fails with the new message. Don't start a second dev server (shared `.svelte-kit`); smoke-test pages from the worktree per the worktree workflow.
- [ ] **Step 6:** `npm run check && npm run lint` → PASS. Commit.

```bash
git add scripts package.json README.md
git commit -m "chore(holiday): dev data for every holiday state"
```

---

### Task 12: Docs

**Files:** Modify `docs/spec.md`, `docs/rules.md`

- [ ] **Step 1: `docs/spec.md`.**
  - Season lifecycle, step 4 (play): after "Weeks are **published** …" add "except a holiday's early matches (Holiday mode)".
  - New section `## Holiday mode` after Reporting & trust: the request limits, statuses, unlock rule (approved or revoked), visibility truth table (compact), hiding via `isPublished` (`league/publish.ts`), publish posting early results, audit rows (no reason), dev scripts pointer. Plan: `docs/superpowers/plans/2026-11-02-holiday-mode.md`.
  - Reporting & trust: "Every result change … goes to a public audit log" → add "(rows of a match in an unpublished round appear once it's published)".
  - Discord: organizer channel "flags, drops, holiday requests"; results channel "every reported result (early holiday results when their week is published)".
  - Organizer powers, Play row: "approve, reject or revoke holidays".
  - Public API: "published rounds only" already covers it; add "results in unpublished rounds (holiday mode) never appear in standings or legends".
  - Phases list (bottom): add `13. **Holiday mode** — …`.
- [ ] **Step 2: `docs/rules.md`** — under the schedule/overdue rules: "**Going away?** Ask for a holiday on your player page (up to 4 weeks, before the season deadline). Once an organizer approves, your matches in those weeks unlock early so you and each opponent can play and report them before you go. The results count once their week is published."
- [ ] **Step 3:** `npx vitest run src/lib/rules.spec.ts && npm run lint` → PASS. Commit.

```bash
git add docs/spec.md docs/rules.md
git commit -m "docs(holiday): spec and rules for holiday mode"
```

(The plan file itself goes into `docs/superpowers/plans/2026-11-02-holiday-mode.md` with the first commit of the branch.)

---

### Task 13: Verify

- [ ] `npm run lint` → clean (CI runs `prettier --check`; `npm run format` if not).
- [ ] `npm run check` → 0 errors, 0 warnings.
- [ ] `npx vitest run` → all pass; grep the new specs ran: `npx vitest run src/lib/league/holiday.spec.ts src/lib/server/holidays.spec.ts`.
- [ ] `npm run test:e2e` → all pass (holiday, mobile, api, unpublished-match, report-flag especially).
- [ ] Leak sweep: `grep -rn "publishedRound" src --include=*.ts | grep -v spec` — every comparison of a round with `publishedRound` outside `publish.ts`/`holiday.ts` is a nextPublish/week calculation, not a visibility rule. `grep -rn "seasonMatches(" src/routes src/lib/server/api.ts` — each public use goes through `published()` or `groupStandings`.
- [ ] Hand check on the dev DB (Task 11 Step 5): your page shows "Holiday approved" and two "Unlocked early" cards; Admin → Season shows one pending and two approved; the public audit log shows the holiday lines and no round 11 report; Admin → Matches shows the round 11 early result.
- [ ] Ask before pushing / opening the PR (`feat(holiday): players request holiday mode to play upcoming matches early`, body `Closes #141`). Suggest `/code-review` before merge.
