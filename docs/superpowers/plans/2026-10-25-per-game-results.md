# Per-Game Result Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report who won each game of a Bo3 (or Draw) instead of game counts, store the sequence, keep the counts derived from it (issue #79).

**Architecture:** One pure function `scoreGames` (`src/lib/league/score.ts`) validates a 3-slot sequence and derives the counts; `parseReport` and the new `GameRows.svelte` both call it, so server and live form agree. `matches.games` (nullable text, `1`/`2`/`D` per game) is written next to `p1_games`/`p2_games`, so standings, legend stats, Discord posts and lists stay unchanged. The match page shows the sequence as the design's game chips inside its `MatchCard`; the audit line names each game's winner.

**Tech Stack:** SvelteKit · Drizzle (better-sqlite3) · Vitest · Playwright

**Design:** Poroleague Screens canvas boards `Report`, `MobileReport`, `Match`, `MobileMatch`, `AdminMatches`; design-system components `GameRows`, `GameChips`, `scoreGames` (`project/components/bundle.js`). CSS (`pb-games`, `pb-game*`, `pb-gchip*`, `pb-match-games*`, `pb-sr`) is already in the `src/lib/styles/porobound.css` snapshot.

**Deviations from #79 / the design:**

- "Rejected: a sequence whose derived score isn't in the valid set" can't be built: ≤3 games with no game after 2 wins only yields valid scores. The `isValidScore` check stays as a guard; the test asserts every reachable sequence is valid instead.
- Errors never name a player (the server parse has no names): "Game 3 can't be played: the match was already 2–0." The live "Result: …" line under the rows uses names.
- Match page keeps its current `MatchCard` layout and adds the chips row; the board's big-score panel and "Games" list table are skipped (chips carry the same data).
- No-JS: games 2/3 can't be cleared once picked (Clear is a JS button). The confirm dialog needs JS anyway.

---

## File map

- Modify `src/lib/league/score.ts` (+ create `score.spec.ts`): `0-0` valid, `scoreGames`.
- Modify `src/lib/league/report.ts`, `report.spec.ts`: read `game1..game3`, `Report.games`.
- Modify `src/lib/league/legendStats.ts`, `legendStats.spec.ts`: 0-game guard in `gameWinPct`.
- Modify `src/lib/server/db/schema.ts`; generate `drizzle/0004_*.sql` + meta; create `src/lib/server/db/migrate-games.spec.ts`.
- Modify `src/lib/server/matches.ts`: `resultOf` / `adminRows` carry `games`.
- Modify `src/lib/server/auditLog.ts`: games in result lines.
- Create `src/lib/components/GameRows.svelte`; modify `ResultFields.svelte`, `MatchCard.svelte`, `src/routes/seasons/[slug]/matches/[id]/+page.svelte`.
- Modify unit fixtures (`actions.spec.ts`, `audit.spec.ts`, `discord.spec.ts`, any `Report` literal the typecheck flags).
- Modify `e2e/db.ts`, `e2e/report-flag.spec.ts`, `e2e/rules.spec.ts`, `e2e/csrf.spec.ts`; create `e2e/per-game.spec.ts`.
- Modify `docs/rules.md`.

---

### Task 1: `scoreGames` and `0-0`

**Files:** Modify `src/lib/league/score.ts` · Create `src/lib/league/score.spec.ts`

- [ ] **Step 1: Failing tests** — `src/lib/league/score.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidScore, matchPoints, scoreGames } from './score';

const seq = (s: string) => [...s.padEnd(3, ' ')].map((c) => c.trim());

describe('scoreGames', () => {
	it('derives counts from every valid sequence', () => {
		for (const [s, p1, p2] of [
			['11', 2, 0],
			['121', 2, 1],
			['212', 1, 2],
			['22', 0, 2],
			['1', 1, 0],
			['12', 1, 1],
			['1D2', 1, 1],
			['D12', 1, 1],
			['DD1', 1, 0],
			['1D1', 2, 0],
			['D', 0, 0],
			['DD', 0, 0],
			['DDD', 0, 0]
		] as const)
			expect(scoreGames(seq(s)), s).toEqual({ ok: true, games: s, p1, p2 });
	});

	it('only ever derives scores from the valid set', () => {
		const all = ['', '1', '2', 'D'];
		for (const a of all)
			for (const b of all)
				for (const c of all) {
					const r = scoreGames([a, b, c]);
					if (r.ok) expect(isValidScore(r.p1, r.p2)).toBe(true);
				}
	});

	it('rejects a missing game 1, a gap, a game after 2–0, and unknown values', () => {
		expect(scoreGames(['', '', ''])).toEqual({
			ok: false,
			error: 'Pick the result of game 1.',
			game: 0
		});
		expect(scoreGames(['', '1', ''])).toMatchObject({ ok: false, game: 0 });
		expect(scoreGames(['1', '', '2'])).toEqual({
			ok: false,
			error: "Game 3 can't be played without game 2.",
			game: 2
		});
		expect(scoreGames(['1', '1', '2'])).toEqual({
			ok: false,
			error: "Game 3 can't be played: the match was already 2–0.",
			game: 2
		});
		expect(scoreGames(['2', '2', 'D'])).toMatchObject({ ok: false, game: 2 });
		expect(scoreGames(['1', 'x', ''])).toEqual({
			ok: false,
			error: "That isn't a possible Bo3 result.",
			game: 1
		});
	});
});

describe('score', () => {
	it('accepts 0–0 as a draw', () => {
		expect(isValidScore(0, 0)).toBe(true);
		expect(matchPoints(0, 0)).toEqual([1, 1]);
	});
});
```

- [ ] **Step 2:** `npx vitest run src/lib/league/score.spec.ts` → FAIL (`scoreGames` not exported).

- [ ] **Step 3: Implement** — `src/lib/league/score.ts`:

```ts
const VALID = new Set(['2-0', '2-1', '1-0', '1-1', '0-0', '0-1', '0-2', '1-2']);

export function isValidScore(a: number, b: number): boolean {
	return VALID.has(`${a}-${b}`);
}

export function matchPoints(a: number, b: number): [number, number] {
	return a > b ? [3, 0] : a < b ? [0, 3] : [1, 1];
}

// One char per game played: '1' or '2' (who won it) or 'D'. `game` is the 0-based row to mark.
export type GamesScore =
	{ ok: true; games: string; p1: number; p2: number } | { ok: false; error: string; game: number };

// Games 2 and 3 are optional (time can run out), with no gaps and nothing after a player has 2 wins.
export function scoreGames(picks: string[]): GamesScore {
	const won = { '1': 0, '2': 0, D: 0 };
	let games = '';
	for (const [i, g] of picks.entries()) {
		if (!g) {
			const next = picks.findIndex((x, j) => j > i && x);
			if (i === 0) return { ok: false, error: 'Pick the result of game 1.', game: 0 };
			if (next > 0)
				return {
					ok: false,
					error: `Game ${next + 1} can't be played without game ${i + 1}.`,
					game: next
				};
			break;
		}
		if (!(g in won)) return { ok: false, error: "That isn't a possible Bo3 result.", game: i };
		if (won['1'] === 2 || won['2'] === 2)
			return {
				ok: false,
				error: `Game ${i + 1} can't be played: the match was already ${won['1']}–${won['2']}.`,
				game: i
			};
		won[g as keyof typeof won]++;
		games += g;
	}
	if (!isValidScore(won['1'], won['2']))
		return { ok: false, error: "That isn't a possible Bo3 result.", game: 0 };
	return { ok: true, games, p1: won['1'], p2: won['2'] };
}
```

- [ ] **Step 4:** `npx vitest run src/lib/league/score.spec.ts` → PASS. Break it once (drop the `won === 2` check) → the 2–0 test fails; restore.
- [ ] **Step 5:** Commit `feat: scoreGames derives Bo3 counts from per-game picks`.

---

### Task 2: `parseReport` reads the game rows

**Files:** Modify `src/lib/league/report.ts`, `src/lib/league/report.spec.ts`

- [ ] **Step 1: Failing tests** — in `report.spec.ts` replace `valid` and the three score tests:

```ts
const valid = { game1: '1', game2: '2', game3: '1', p1Legend: 'Jinx', p2Legend: 'Ahri', dice: 'a' };

it('parses a valid report', () => {
	expect(parseReport(form(valid), 'a', 'b')).toEqual({
		ok: true,
		values: {
			games: '121',
			p1Games: 2,
			p2Games: 1,
			p1Legend: 'Jinx',
			p2Legend: 'Ahri',
			diceWinnerId: 'a'
		}
	});
});

it('leaves unplayed games out: 2–0, a 1–0 called on time, a 0–0 draw', () => {
	const values = (o: Record<string, string>) => {
		const r = parseReport(form({ ...valid, game2: '', game3: '', ...o }), 'a', 'b');
		return r.ok && [r.values.games, r.values.p1Games, r.values.p2Games];
	};
	expect(values({ game2: '1' })).toEqual(['11', 2, 0]);
	expect(values({})).toEqual(['1', 1, 0]);
	expect(values({ game1: 'D', game2: 'D' })).toEqual(['DD', 0, 0]);
});

it('rejects bad sequences with the score error', () => {
	for (const o of [{ game1: '' }, { game2: '' }, { game3: '2', game2: '1' }, { game1: '3' }]) {
		const r = parseReport(form({ ...valid, ...o }), 'a', 'b');
		expect(r.ok ? null : Object.keys(r.errors)).toEqual(['score']);
	}
});
```

Keep the legend/dice test; add `game1..3` to its form via `...valid` (already there). Add one check that legend and dice errors come alongside a bad sequence:

```ts
it('reports game, legend and dice errors together', () => {
	const r = parseReport(form({ ...valid, game1: '', p1Legend: '', dice: 'c' }), 'a', 'b');
	expect(Object.keys(r.ok ? {} : r.errors).sort()).toEqual(['dice', 'p1Legend', 'score']);
});
```

- [ ] **Step 2:** `npx vitest run src/lib/league/report.spec.ts` → FAIL.

- [ ] **Step 3: Implement** — `report.ts`:

```ts
import { scoreGames } from './score';

export type Report = {
	games: string | null; // null on results reported before per-game reporting
	p1Games: number;
	p2Games: number;
	p1Legend: string;
	p2Legend: string;
	diceWinnerId: string;
};
```

and in `parseReport` replace the games reading and the score check:

```ts
const get = (k: string) => String(form.get(k) ?? '').trim();
const score = scoreGames([get('game1'), get('game2'), get('game3')]);
const values: Report = {
	games: score.ok ? score.games : null,
	p1Games: score.ok ? score.p1 : 0,
	p2Games: score.ok ? score.p2 : 0,
	p1Legend: get('p1Legend'),
	p2Legend: get('p2Legend'),
	diceWinnerId: get('dice')
};

const errors: ReportErrors = {};
if (!score.ok) errors.score = score.error;
```

- [ ] **Step 4:** `npx vitest run src/lib/league/report.spec.ts` → PASS.
- [ ] **Step 5:** Commit `feat: parseReport reads per-game rows`.

---

### Task 3: Legend stats survive 0–0 draws

**Files:** Modify `src/lib/league/legendStats.ts:104-105`, `legendStats.spec.ts`

- [ ] **Step 1: Failing test** — add to `legendStats.spec.ts` (use the file's existing tally helper/fixture style):

```ts
it('gives no game-win % when every rated match was a 0–0 draw', () => {
	const t = { wins: 0, draws: 5, losses: 0, gameWins: 0, gameLosses: 0 };
	expect(gameWinPct(t as Tally)).toBeNull();
});
```

(`Tally` may have more fields; build it with whatever factory the spec already uses so the test compiles.)

- [ ] **Step 2:** Run → FAIL (`NaN`).
- [ ] **Step 3:**

```ts
export const gameWinPct = (t: Tally, min = MIN_RATED) =>
	results(t) >= Math.max(min, 1) && t.gameWins + t.gameLosses
		? t.gameWins / (t.gameWins + t.gameLosses)
		: null;
```

Check every `gameWinPct` caller renders `null` as "–" (it already does for under-rated legends).

- [ ] **Step 4:** Run → PASS. Standings already guard (`standings.ts:60`).
- [ ] **Step 5:** Commit `fix: no NaN game-win % for 0–0 draws`.

---

### Task 4: `matches.games` column, server writes, migration test

**Files:** Modify `src/lib/server/db/schema.ts`, `src/lib/server/matches.ts`; generate `drizzle/0004_*`; Create `src/lib/server/db/migrate-games.spec.ts`; Modify `src/lib/server/actions.spec.ts`, `src/lib/server/audit.spec.ts`, other `Report` literals.

- [ ] **Step 1: Schema** — after `p2Games` in `matches`:

```ts
		games: text('games'), // per game: '1', '2' or 'D'; null if reported as counts only
```

- [ ] **Step 2:** `npm run db:generate` → `drizzle/0004_*.sql` is `ALTER TABLE \`matches\` ADD \`games\` text;`.

- [ ] **Step 3: Server** — `matches.ts`: `saveReport`/`organizerEdit` already spread `values`, so `games` is written and audited. `resultOf` adds `games: m.games,` first. `adminRows` `values` gets the rows' pre-fill instead of counts:

```ts
			values: {
				game1: m.games?.[0] ?? '',
				game2: m.games?.[1] ?? '',
				game3: m.games?.[2] ?? '',
				p1Legend: ...
```

(drop `p1Games`/`p2Games` from `values`). A legacy row opens with empty game rows; the organizer re-enters the games.

- [ ] **Step 4: Fixtures** — `npm run check`; add `games` to every `Report` literal it flags (`audit.spec.ts` `report` → `games: '121'`, `fixed` → `games: '212'`; `actions.spec.ts` `reported()` → `games: '121'`; `discord.spec.ts` etc.). In `actions.spec.ts` change `result` to `{ game1: '1', game2: '2', game3: '1', p1Legend: 'Jinx', p2Legend: 'Viktor' }` and the bad-form test to `{ ...result, game1: '', dice: 'p3' }`.

- [ ] **Step 5: Failing tests** — `actions.spec.ts`, player report:

```ts
it('saves the games and the counts they give', async () => {
	await report(m1, as('p1'), { ...result, game3: '', game2: 'D', dice: 'p1' });
	expect(get(m1)).toMatchObject({ games: '1D', p1Games: 1, p2Games: 0 });
});
```

and in the organizer edit describe (same file; follow its existing `edit(...)` helper):

```
	it('replaces games and counts, and audits both', async () => {
		// reported 121 first, then the organizer edits to 22
		...
		expect(get(m1)).toMatchObject({ games: '22', p1Games: 0, p2Games: 2 });
		expect(lastAudit()).toMatchObject({
			before: expect.objectContaining({ games: '121' }),
			after: expect.objectContaining({ games: '22' })
		});
	});
```

`audit.spec.ts` `saveReport` test already asserts `after: report` → now includes `games`. Add one legacy check: `organizerEdit` on a row seeded with counts and `games: null` audits `before.games === null`.

- [ ] **Step 6: Migration test** — `src/lib/server/db/migrate-games.spec.ts`, same approach as `migrate-ids.spec.ts`: copy `drizzle/` with the journal cut to `idx <= 3`, migrate, insert a reported match (`p1_games 2, p2_games 1`), migrate with the full folder, then:

```ts
it('keeps counts and leaves games null', () => {
	expect(db.prepare('select p1_games, p2_games, games from matches').get()).toEqual({
		p1_games: 2,
		p2_games: 1,
		games: null
	});
});
```

- [ ] **Step 7:** `npx vitest run` → all PASS. Commit `feat: store per-game sequence on matches` (include `drizzle/`).

---

### Task 5: Audit line shows the games

**Files:** Modify `src/lib/server/auditLog.ts`; tests in `src/lib/server/audit.spec.ts` (or wherever `auditLines` is tested — grep `auditLines`).

- [ ] **Step 1: Failing test:**

```ts
it('names who won each game when the report has them, counts only for legacy rows', () => {
	saveReport(match, 'p1', { ...report, games: '1D2', p1Games: 1, p2Games: 1 });
	organizerEdit(reload(), ORG, { ...report, games: null });
	const [edit, rep] = auditLines(season.id);
	expect(rep.what).toBe('R1 · P1 1–1 P2 · games P1, draw, P2 · Jinx vs Viktor · dice: P1');
	expect(edit.what).toContain('→ P1 2–1 P2 · Jinx vs Viktor');
});
```

(Adjust `P1`/`P2` to the seed's display names and `R1` to the actual `where` prefix; read one existing `auditLines` assertion first.)

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** In `auditLines`, `result`:

```ts
const seq = (games: string | null | undefined) =>
	games
		? ` · games ${[...games].map((g) => (g === 'D' ? 'draw' : name(g === '1' ? r.p1Id : r.p2Id))).join(', ')}`
		: '';
const result = (c: Change | null) =>
	c?.p1Games != null
		? `${name(r.p1Id)} ${c.p1Games}–${c.p2Games} ${name(r.p2Id)}${seq(c.games)} · ${c.p1Legend} vs ${c.p2Legend} · dice: ${name(c.diceWinnerId)}`
		: '';
```

- [ ] **Step 4:** Run → PASS. Commit `feat: audit lines list per-game winners`.

---

### Task 6: `GameRows` component; organizer edit uses it

**Files:** Create `src/lib/components/GameRows.svelte`; Modify `src/lib/components/ResultFields.svelte`

- [ ] **Step 1: Component** — markup and behaviour from the design system's `GameRows` (classes from `porobound.css`):

```svelte
<script lang="ts">
	import { tick } from 'svelte';
	import { scoreGames } from '#lib/league/score.ts';

	type Who = { name: string };
	type Values = { game1: string; game2: string; game3: string };
	// Each game is a labelled radio group: first player · Draw · second player. Form fields game1..3.
	let {
		p1,
		p2,
		values,
		compact = false
	}: { p1: Who; p2: Who; values: Values; compact?: boolean } = $props();

	let picks = $state([values.game1, values.game2, values.game3]);
	const uid = $props.id();
	const score = $derived(scoreGames(picks));
	const result = $derived.by(() => {
		if (!score.ok) return score.error;
		if (score.p1 === score.p2) return `Result: Draw ${score.p1}–${score.p2}`;
		const [w, l] = score.p1 > score.p2 ? [p1, p2] : [p2, p1];
		return `Result: ${w.name} ${Math.max(score.p1, score.p2)}–${Math.min(score.p1, score.p2)} ${l.name}`;
	});
	// Clear isn't a form input, so tell the form its values changed.
	async function clear(i: number, el: HTMLElement) {
		picks[i] = '';
		await tick();
		el.closest('form')?.dispatchEvent(new Event('change', { bubbles: true }));
	}
	const opts = $derived([
		['1', p1.name],
		['D', 'Draw'],
		['2', p2.name]
	]);
</script>

<div class={['pb-games', compact && 'pb-games-compact']}>
	{#each [0, 1, 2] as i (i)}
		<div
			class={['pb-game', !score.ok && picks[0] && score.game === i && 'is-error']}
			role="radiogroup"
			aria-labelledby="{uid}-g{i}"
			aria-required={i === 0 || undefined}
			aria-invalid={(!score.ok && picks[0] && score.game === i) || undefined}
		>
			<span id="{uid}-g{i}" class="pb-game-label"
				>Game {i + 1}<span class="pb-game-req">{i === 0 ? 'Required' : 'Optional'}</span></span
			>
			<div class="pb-game-opts">
				{#each opts as [v, label] (v)}
					<label class={['pb-game-opt', v === 'D' && 'is-draw']}>
						<input
							type="radio"
							name="game{i + 1}"
							value={v}
							bind:group={picks[i]}
							required={i === 0}
						/>
						<span class="pb-game-opt-text" title={label}>{label}</span>
					</label>
				{/each}
			</div>
			{#if i > 0}
				<button
					type="button"
					class="pb-game-clear"
					disabled={!picks[i]}
					aria-label="Clear game {i + 1}"
					onclick={(e) => clear(i, e.currentTarget)}>Clear</button
				>
			{:else}
				<span class="pb-game-clear" aria-hidden="true"></span>
			{/if}
		</div>
	{/each}
	<p
		class={['pb-games-result', !picks[0] ? 'is-incomplete' : !score.ok && 'is-error']}
		role={score.ok || !picks[0] ? 'status' : 'alert'}
	>
		{result}
	</p>
</div>
```

The radiogroup's accessible name is "Game N Required"/"Game N Optional"; tests select `getByRole('radiogroup', { name: /^Game 1/ })`.

- [ ] **Step 2: ResultFields** — replace the `{who.name} games` select with GameRows above the legend grid; legend labels become `{who.name}'s legend`:

```
<script lang="ts">
	import GameRows from '#lib/components/GameRows.svelte';
	import { LEGENDS } from '#lib/legends.ts';

	type Who = { id: string; name: string };
	type Values = {
		game1: string;
		game2: string;
		game3: string;
		p1Legend: string;
		p2Legend: string;
		dice: string;
	};
	...
</script>

<GameRows {p1} {p2} {values} compact />
<div class="grid-2">
	{#each sides as [k, who] (k)}
		<label class="pb-field">
			{who.name}’s legend
			...legend select unchanged...
		</label>
	{/each}
</div>
```

- [ ] **Step 3:** `npm run check` → clean. Commit `feat: GameRows; organizer result edit uses per-game rows`.

---

### Task 7: Match page — report form and game chips

**Files:** Modify `src/routes/seasons/[slug]/matches/[id]/+page.svelte`, `src/lib/components/MatchCard.svelte`

- [ ] **Step 1: MatchCard chips** — new optional prop `games?: (0 | 1 | null)[]` (side index that won each game in display order, `null` = draw). After the sides loop:

```svelte
{#if games?.length}
	<div class="pb-match-games">
		<span class="pb-match-games-k">Games</span>
		<ol class="pb-gchips" aria-label="Games">
			{#each games as g, i (i)}
				{@const who = g === null ? null : sides[g]}
				<li
					class={[
						'pb-gchip',
						g === null && 'is-draw',
						g !== null && g === winner && 'is-match-winner'
					]}
					title="Game {i + 1}: {who ? `${who.name} won` : 'draw'}"
				>
					<span class="pb-gchip-n" aria-hidden="true">{i + 1}</span><span class="pb-sr"
						>Game {i + 1}:
					</span>{who ? (who.former ? who.name : who.name.split(/\s+/)[0]) : 'Draw'}
				</li>
			{/each}
		</ol>
	</div>
{/if}
```

- [ ] **Step 2: Match page** — `Result` type gains `games: string | null`; `card()` returns

```ts
games: r.games
	? [...r.games].map((g) => (g === 'D' ? null : (order.indexOf(g === '1' ? 'p1' : 'p2') as 0 | 1)))
	: undefined;
```

Pre-fill `values`: replace `p1Games`/`p2Games` with `game1: m.games?.[0] ?? ''`, `game2`, `game3`. Form: delete both "Games won" fieldsets from the side panels; insert before the sides grid

```svelte
<section class="games" aria-labelledby="games-h">
	<h2 id="games-h" class="eyebrow">Games</h2>
	<GameRows p1={{ name: data.p1.displayName }} p2={{ name: data.p2.displayName }} {values} />
</section>
```

Players in GameRows always go p1, Draw, p2 (form values are p1/p2; viewer-first would flip meaning of `1`). Remove `scoreError` and its `<p>` — GameRows shows the live error; keep the `errors.score` paragraph for server errors. Remove `.side .opts` CSS. `compact` stays for dialogs; the page goes compact on phones with CSS (mirrors `.pb-games-compact`):

```css
@media (max-width: 640px) {
	.games :global(.pb-game) {
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'label clear' 'opts opts';
	}
	.games :global(.pb-game-label) {
		grid-area: label;
		flex-direction: row;
		align-items: baseline;
		gap: 8px;
	}
	.games :global(.pb-game-opts) {
		grid-area: opts;
	}
	.games :global(.pb-game-clear) {
		grid-area: clear;
		min-height: 32px;
	}
}
```

- [ ] **Step 3:** `npm run check`; `npm run dev` is the owner's — smoke-test via `npm run test:e2e` in Task 8.
- [ ] **Step 4:** Commit `feat: match page reports per game and shows game chips`.

---

### Task 8: e2e

**Files:** Modify `e2e/db.ts`, `e2e/report-flag.spec.ts`, `e2e/rules.spec.ts`, `e2e/csrf.spec.ts`; Create `e2e/per-game.spec.ts` (+ a season key in `e2e/fixtures.ts` `SEASONS`, following existing entries).

- [ ] **Step 1: Seed** — `seedResult(matchId, p1Games, p2Games, { flag, legends, games })`: set `games = ?` (default `null`) in the update and add `'games', games` to the audit `json_object`.

- [ ] **Step 2: Update specs:**
  - `report-flag.spec.ts`: replace the "Games won" block with
    ```ts
    const game = (n: number) =>
    	reporter.getByRole('radiogroup', { name: new RegExp(`^Game ${n}`) });
    await expect(add).toBeDisabled();
    // p1 · Draw · p2 sit on one row, apart.
    const boxes = await Promise.all(
    	[p1, 'Draw', p2].map(
    		async (n) => (await game(1).getByText(n, { exact: true }).boundingBox())!
    	)
    );
    expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
    expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
    await game(1).getByLabel(p1).check();
    await game(2).getByLabel(p1).check();
    await game(3).getByLabel(p2).check();
    await expect(reporter.getByRole('alert')).toHaveText(
    	"Game 3 can't be played: the match was already 2–0."
    );
    await expect(add).toBeDisabled();
    await game(2).getByLabel(p2).check();
    await game(3).getByLabel(p1).check();
    await expect(reporter.getByText(`Result: ${p1} 2–1 ${p2}`)).toBeVisible();
    ```
    Card regex: allow the trailing chips (`card()` matches the start; append `.*Games` check: `await expect(reporter.getByRole('list', { name: 'Games' })).toHaveText(/1.*Game 1: .*2.*3/s)` — or assert the three chip titles). Organizer edit: the dialog opens with game rows filled (`await expect(edit.getByRole('radiogroup', { name: /^Game 3/ }).getByLabel(p1)).toBeChecked()`), then picks `p2`, `p1`, `p2` → 1–2.
  - `rules.spec.ts`: `game(1)` p1, `game(2)` p1.
  - `csrf.spec.ts`: `game1: '1', game2: '1'` instead of counts.

- [ ] **Step 3: New `e2e/per-game.spec.ts`** — own season (seed in `beforeAll`, remove in `afterAll`), one player reporting several round-1/2/3 matches:
  1. 2–0: games 1, 2 for p1, game 3 untouched → save → match page chips `Game 1: … Game 2: …` and no third chip; standings row shows 3 points.
  2. Draw: game 1 p1, game 2 p2, game 3 Draw → "Result: Draw 1–1" → save → standings show a draw (1 point).
  3. Invalid: game 1 p1, game 3 p2 (gap) → alert "Game 3 can't be played without game 2.", Add result disabled; then submit the form bypassing the button (`page.evaluate(() => document.querySelector('form')!.requestSubmit())` — needs `action="?/report"` form) → server error shown, match still unreported (reload shows "Add result").
  4. Legacy: `seedResult(m, 2, 1)` (games null) → match page shows the 2–1 card with no "Games" list.
  5. Clear: pick game 3, click "Clear game 3" → game 3 radios unchecked, result line updates.

- [ ] **Step 4:** `npm run test:e2e` → all PASS. Commit `test: e2e for per-game reporting`.

---

### Task 9: Rules

**Files:** Modify `docs/rules.md:29-30`

- [ ] **Step 1:**

```md
- **Reporting games.** Report who won each game, or Draw. Game 1 is required; games 2 and 3 only if you played them. A match ends once a player wins 2 games, so there is no game after a 2-0.
- **Draws.** A match that ends level (1-1 or 0-0), including when your agreed time runs out, is a draw.
- **Ending early.** If the match ends at 1-0, because your agreed time runs out or you both agree to stop, the player ahead wins the match.
```

- [ ] **Step 2:** `npx vitest run && npm run check` → green. Commit `docs: per-game reporting rules`.

---

## Done when

- `npx vitest run`, `npm run check`, `npm run test:e2e` green.
- Issue #79 boxes ticked; suggest `/code-review` before PR.
