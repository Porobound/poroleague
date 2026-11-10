# Match Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lists of matches show one-line match rows instead of match cards (#217).

**Architecture:** `matchCard()` stays the single place that turns a match into view data. Two pure functions in `src/lib/matchRow.ts` turn a `Card` into a head-to-head row or a perspective row, and one component, `MatchRows.svelte`, renders either. Pages keep their loaders and swap `<MatchCard>` grids for `<MatchRows>`. Styles come from the design system's `pb-mrow*` classes, which arrive with a re-sync of `porobound.css`.

**Tech Stack:** SvelteKit, TypeScript, Vitest, Playwright.

**Design source:** Claude Design, "Poroleague Screens" canvas, section "Declutter proposals" (`ScheduleRows`, `PlayerRows`, `SeasonRows` and their `Mobile*` boards), and the Porobound design system's `components/MatchRow/README.md`. Design copy is not authoritative; the app's data and wording win.

---

## Decisions

- **Where rows go:** schedule, season page, season player page, public top-cut page. `MatchCard` stays on the match page, the admin overview (flags) and the top-cut admin page.
- **Flags don't show in rows.** A flagged match renders like any reported match.
- **The whole row is one link** to the match page. Player names inside a row are not links. "Report" replaces "vs" on the viewer's own open match.
- **Legends show only once a result is in.**
- **Long names truncate.**
- **Chips:** "Holiday revoked" when either side carries that tag, otherwise "Early" for a match whose week isn't published yet. "On holiday" stays on the player's side.
- **Player page:** one list replaces "Unlocked early", "Who you play next" and "Matches this season": early matches first, then published matches, newest round first.
- **Unplayed result slot in a perspective row:** "Report" for the viewer's own open match, else "Week N" (muted) for a group match.
- **Design-system breakpoints are used as shipped** (`porobound.css` is a verbatim snapshot).

## PRs

| PR  | Issue | Branch                           | Base   | Size (hand-written) |
| --- | ----- | -------------------------------- | ------ | ------------------- |
| 1   | #219  | `chore/219-match-rows-component` | `main` | ~330                |
| 2   | #220  | `feat/220-schedule-rows`         | PR 1   | ~150                |
| 3   | #221  | `feat/221-player-rows`           | PR 1   | ~150                |
| 4   | #222  | `feat/222-season-rows`           | PR 1   | ~150                |
| 5   | #223  | `feat/223-topcut-rows`           | PR 1   | ~80                 |

PRs 2–5 are independent of each other; each is stacked on PR 1 only. `porobound.css` is a design-system snapshot: mark it "not for review" in PR 1's body.

## Rules for every task

- Work in the task's own `git worktree` outside the repo; never switch branches in the main checkout.
- One commit per task, message in the PR-title format, e.g. `feat(schedule): match rows on the schedule`.
- Before pushing: `npm run lint`, `npm run check`, `npx vitest run`, and for page PRs `flock /tmp/poroleague-e2e.lock npm run test:e2e` (the lock keeps parallel worktrees off the shared e2e port).
- e2e selects by role, label and text, never CSS classes.
- Screenshots (`npm run shots`) are generated only on the remote agent container. Page PRs list "screenshots pending" in the body until they are regenerated there.
- PR body: review guide first (reviewable vs generated lines, reading order), `Closes #<issue>`.

---

### Task 1 (PR 1, #219): style re-sync, row view model, component

**Files:**

- Modify: `src/lib/styles/porobound.css` (replace wholesale)
- Modify: `src/lib/matchCard.ts`, `src/lib/matchCard.spec.ts`
- Create: `src/lib/matchRow.ts`, `src/lib/matchRow.spec.ts`
- Create: `src/lib/components/MatchRows.svelte`

- [ ] **Step 1: Re-sync `porobound.css`.** Follow the method of commit `f10fb74` (`git show f10fb74 --stat`, and the header comment of the file): tokens + the design system's `components/bundle.css`, minus the font `@import`, `body` and demo helpers, then `npx prettier --write`. Update the version in the header comment. Check `git diff --stat` and read the diff: besides the new `pb-mrow*` block, list every other changed rule in the PR body. Run `npm run check` and the e2e suite to confirm nothing else moved.

- [ ] **Step 2: Extend `Card`.** In `matchCard()` return, next to `id`, `mine`, `status`:

```ts
		ids: [m.p1Id, m.p2Id] as [string, string],
		// Which side the viewer is, for the "You" tag.
		you: (m.p1Id === c.viewerId ? 0 : m.p2Id === c.viewerId ? 1 : null) as 0 | 1 | null,
		// Group rounds are numbers ("R6"); a playoff match carries its bracket name.
		round: m.stage === 'playoff' ? matchName(m.round, m.slot ?? 0, c.cutRounds) : m.round,
		week,
		early,
		walkover,
```

Add one assertion per new field to an existing test in `matchCard.spec.ts`.

- [ ] **Step 3: Write the failing tests** in `src/lib/matchRow.spec.ts`. Build cards with `matchCard()` and the helpers already used in `matchCard.spec.ts` (copy its fixture setup). Cases:

```ts
// vsRow
it('reported: score, winner and loser, legends, dice on the roller', …)   // sides[0].result 'won', sides[1] 'lost', score [2, 0], mid null
it('draw: score with no winner', …)                                        // result null on both, score [1, 1]
it('scheduled: no legends, mid "vs"', …)
it('own open match: mid "Report"', …)                                      // viewer is p1
it('flagged renders as reported', …)                                       // same output as the reported case
it('void: mid "Void", void true', …)
it('overdue: note "Week 1"', …)
it('holiday: On holiday stays on the side, Holiday revoked becomes a chip', …)
it('early match gets the Early chip', …)
it('walkover: mid "W/O", note "<name> advances"', …)
// povRow
it('reads from the given player: W 2–0 for p1, L 0–2 for p2', …)
it('draw gives D', …)
it('unplayed: text "Report" for the viewer, "Week N" for others', …)
it('void gives text "Void"', …)
it('playoff match keeps its bracket name as the round', …)
```

Run: `npx vitest run src/lib/matchRow.spec.ts` — expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/lib/matchRow.ts`.**

```ts
import type { Card } from '#lib/matchCard.ts';

// Flags are an organizer concern: a flagged match reads like any reported one.
const played = (c: Card) =>
	(c.status === 'reported' || c.status === 'flagged') &&
	c.props.sides.every((s) => s.games !== null);
const chips = (c: Card) =>
	c.props.sides.some((s) => s.tag === 'Holiday revoked')
		? ['Holiday revoked']
		: c.early
			? ['Early']
			: [];
const onHoliday = (tag: string | null) => (tag === 'On holiday' ? tag : null);
const canReport = (c: Card) => c.props.link.label === 'Report';

// Player A, centre slot, player B: the schedule and the bracket.
export function vsRow(c: Card) {
	const done = played(c);
	const [a, b] = c.props.sides.map((s) => s.games ?? 0);
	const best = done && a !== b ? (a > b ? 0 : 1) : null;
	return {
		id: c.id,
		href: c.props.link.href,
		mine: c.mine,
		void: c.status === 'void',
		sides: c.props.sides.map((s, i) => ({
			name: s.name,
			avatar: s.avatar,
			former: s.former,
			legend: done ? s.legend : null,
			tag: onHoliday(s.tag),
			you: c.you === i,
			dice: done && c.props.dice === i,
			result: best === null ? null : best === i ? ('won' as const) : ('lost' as const)
		})),
		score: done ? ([a, b] as const) : null,
		mid: done
			? null
			: c.status === 'void'
				? 'Void'
				: c.walkover
					? 'W/O'
					: canReport(c)
						? 'Report'
						: 'vs',
		note: c.status === 'overdue' ? `Week ${c.week}` : c.walkover ? `${c.walkover} advances` : null,
		warn: c.status === 'overdue',
		chips: chips(c)
	};
}

// One player's matches, read from their side: round, opponent, played as, dice, result.
export function povRow(c: Card, playerId: string) {
	const i = c.ids[1] === playerId ? 1 : 0;
	const me = c.props.sides[i];
	const opp = c.props.sides[1 - i];
	const done = played(c);
	const score = done ? ([me.games!, opp.games!] as const) : null;
	return {
		id: c.id,
		href: c.props.link.href,
		void: c.status === 'void',
		round: c.round,
		opponent: {
			name: opp.name,
			avatar: opp.avatar,
			former: opp.former,
			legend: done ? opp.legend : null,
			tag: onHoliday(opp.tag)
		},
		legend: done ? me.legend : null,
		dice: done && c.props.dice === i,
		overdue: c.status === 'overdue',
		score,
		letter: !score
			? null
			: score[0] > score[1]
				? ('W' as const)
				: score[0] < score[1]
					? ('L' as const)
					: ('D' as const),
		text: score
			? null
			: c.status === 'void'
				? 'Void'
				: c.walkover
					? 'Walkover'
					: canReport(c)
						? 'Report'
						: typeof c.round === 'number'
							? `Week ${c.week}`
							: null,
		chips: chips(c)
	};
}
```

Run: `npx vitest run src/lib/matchRow.spec.ts` — expected: PASS.

- [ ] **Step 5: Create `src/lib/components/MatchRows.svelte`.** Class names come from the re-synced `porobound.css`; check each one exists there (`pb-mrows`, `pb-mrow`, `pb-mrow-vs`, `pb-mrow-pov`, `pb-mrow-side`, `pb-mrow-tx`, `pb-mrow-who`, `pb-mrow-nm`, `pb-mrow-sub`, `pb-mrow-mid`, `pb-mrow-sc`, `pb-mrow-meta`, `pb-mrow-note`, `pb-mrow-go`, `pb-mrow-mut`, `pb-mrow-head`, `pb-mrow-rd`, `pb-mrow-opp`, `pb-mrow-as`, `pb-mrow-ascol`, `pb-mrow-dice`, `pb-mrow-res`, `pb-mrow-l`, `pb-you`, `pb-sr`, `pb-die`, `pb-badge-sm`).

```svelte
<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import type { Card } from '#lib/matchCard.ts';
	import { povRow, vsRow } from '#lib/matchRow.ts';

	let {
		cards,
		player = null,
		label,
		header = true
	}: {
		cards: Card[];
		// Set: rows read from this player's side. Unset: head-to-head rows.
		player?: string | null;
		label: string;
		header?: boolean;
	} = $props();
	const WORD = { W: 'Won', L: 'Lost', D: 'Drew' } as const;
</script>

{#snippet die()}
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
{/snippet}
{#snippet badges(list: (string | null)[])}
	{#each list.filter(Boolean) as t (t)}<span class="pb-badge pb-badge-sm">{t}</span>{/each}
{/snippet}

<div class={['pb-mrows', player ? 'pb-mrows-pov' : 'pb-mrows-vs']}>
	{#if player && header}
		<div class="pb-mrow-head" aria-hidden="true">
			<span>Round</span><span>Opponent</span><span>Played as</span><span>Dice</span><span
				>Result</span
			>
		</div>
	{/if}
	<ul aria-label={label}>
		{#each cards as c (c.id)}
			<li>
				{#if player}
					{@const r = povRow(c, player)}
					<a class={['pb-mrow pb-mrow-pov', r.void && 'is-void']} href={r.href}>
						<span class="pb-mrow-rd">
							{#if typeof r.round === 'number'}
								<span aria-hidden="true">R{r.round}</span><span class="pb-sr">Round {r.round}</span>
							{:else}{r.round}{/if}
						</span>
						<span class={['pb-mrow-opp', r.opponent.former && 'is-former']}>
							<Avatar
								name={r.opponent.name}
								src={r.opponent.avatar}
								former={r.opponent.former}
								size={28}
							/>
							<span class="pb-mrow-tx">
								<span class="pb-mrow-who">
									<span class="pb-sr">against </span><span class="pb-mrow-nm"
										>{r.opponent.name}</span
									>
									{#if r.overdue}<span class="pb-mrow-note is-warn">Overdue</span>{/if}
									{@render badges([r.opponent.tag, ...r.chips])}
								</span>
								{#if r.legend || r.opponent.legend}
									<span class="pb-mrow-sub">
										<span>
											{#if r.legend}<span class="pb-mrow-as">as {r.legend} · vs </span>{/if}{r
												.opponent.legend}
										</span>
									</span>
								{/if}
							</span>
						</span>
						<span class="pb-mrow-ascol">
							{#if r.legend}<span class="pb-sr">played as </span>{r.legend}{/if}
						</span>
						<span class="pb-mrow-dice"
							>{#if r.dice}{@render die()}{/if}</span
						>
						<span class="pb-mrow-res">
							{#if r.score && r.letter}
								<span class={['pb-mrow-l', `is-${r.letter.toLowerCase()}`]} aria-hidden="true"
									>{r.letter}</span
								><span class="pb-sr">{WORD[r.letter]} </span>{r.score[0]}–{r.score[1]}
							{:else if r.text === 'Report'}
								<span class="pb-mrow-go">Report<span class="pb-sr"> result</span></span>
							{:else if r.text}
								<span class="pb-mrow-mut">{r.text}</span>
							{/if}
						</span>
					</a>
				{:else}
					{@const r = vsRow(c)}
					<a class={['pb-mrow pb-mrow-vs', r.mine && 'is-mine', r.void && 'is-void']} href={r.href}>
						{#each r.sides as s, i (i)}
							{#if i === 1}
								<span class="pb-mrow-mid">
									{#if r.score}
										<span class="pb-mrow-sc">
											<span class={[s.result === 'lost' && 'is-win']}>{r.score[0]}</span><span
												aria-hidden="true">–</span
											><span class="pb-sr"> to </span><span class={[s.result === 'won' && 'is-win']}
												>{r.score[1]}</span
											>{#if !s.result}<span class="pb-sr">, draw</span>{/if}
										</span>
									{:else if r.mid === 'Report'}
										<span class="pb-mrow-go">Report<span class="pb-sr"> result</span></span>
									{:else}
										<span class="pb-mrow-mut">{r.mid}</span>
									{/if}
								</span>
							{/if}
							<span
								class={[
									'pb-mrow-side',
									i ? 'is-b' : 'is-a',
									s.result === 'won' && 'is-winner',
									s.result === 'lost' && 'is-loser',
									s.former && 'is-former'
								]}
							>
								<Avatar name={s.name} src={s.avatar} former={s.former} size={28} />
								<span class="pb-mrow-tx">
									<span class="pb-mrow-who">
										<span class="pb-mrow-nm">{s.name}</span>
										{#if s.you}<span class="pb-you">You</span>{/if}
										{#if s.dice}{@render die()}{/if}
										{#if s.result}<span class="pb-sr">{s.result}</span>{/if}
									</span>
									{#if s.legend || s.tag}
										<span class="pb-mrow-sub">
											{#if s.legend}<span>{s.legend}</span>{/if}
											{@render badges([s.tag])}
										</span>
									{/if}
								</span>
							</span>
						{/each}
						{#if r.note || r.chips.length}
							<span class="pb-mrow-meta">
								{#if r.note}<span class={['pb-mrow-note', r.warn && 'is-warn']}>{r.note}</span>{/if}
								{@render badges(r.chips)}
							</span>
						{/if}
					</a>
				{/if}
			</li>
		{/each}
	</ul>
</div>
```

The design-system markup this mirrors is `MatchRowVs` / `MatchRowPov` in the design system's `components/bundle.js`; where the two differ, follow the bundle. Run `npx prettier --write` on the file.

- [ ] **Step 6: Verify and commit.** `npm run lint && npm run check && npx vitest run` all pass. The component is unused, so no page changes and no e2e changes. Commit: `chore(styles): re-sync Porobound snapshot and add MatchRows`.

---

### Task 2 (PR 2, #220): schedule

**Files:**

- Modify: `src/routes/seasons/[slug]/schedule/+page.svelte`, `+page.server.ts`
- Modify: `src/app.css` (only to remove rules that become unused, or add the round panel)
- Test: the e2e specs that read the schedule (`grep -ln "schedule" e2e/*.ts`), `src/lib/server/pages.spec.ts` if it asserts the section shape

- [ ] **Step 1: Update e2e first.** For each schedule assertion that relies on card text ("Scheduled", "Final", "View", a "Report" link by name, "Reported by …", player-name links), rewrite it against the row: the round panel is `getByRole('list', { name: 'Group A · Round 3' })`, a row is a link inside it containing both player names. Add one test: a reported match shows its score in the row and the row links to the match page; the viewer's own open match shows "Report". Run the changed specs: expected FAIL.

- [ ] **Step 2: Swap the markup.** Each section becomes a panel with a header and rows; overdue likewise:

```svelte
{#if data.overdue.length}
	<section class="panel rows overdue" aria-label="Overdue from earlier weeks">
		<div class="rows-head">
			<h2>Overdue</h2>
			<span class="muted small">From earlier weeks · still reportable</span>
		</div>
		<MatchRows cards={data.overdue} label="Overdue from earlier weeks" />
	</section>
{/if}
…
{#each shown as s (s.title)}
	<section class="panel rows" aria-label={s.title}>
		<div class="rows-head">
			<h2>{s.title}</h2>
			<span class="muted small"
				><span class="pb-num">{s.done}</span> of <span class="pb-num">{s.total}</span> played</span
			>
		</div>
		<MatchRows cards={s.cards} label={s.title} />
	</section>
{:else}
	<p class="empty">No matches for you in this view.</p>
{/each}
```

Lay the round panels out in a grid (`repeat(auto-fit, minmax(min(460px, 100%), 1fr))`). The collapsible `<details>` goes: rows are short. Drop `flagged` and `voids` from the section summary in `+page.server.ts` if nothing else reads them. Remove CSS that only the old markup used.

- [ ] **Step 3: Verify.** Changed specs pass; then the full gate from "Rules for every task". `e2e/mobile.spec.ts` must still pass (no sideways scroll at 390px).

- [ ] **Step 4: Commit.** `feat(schedule): match rows on the schedule`.

---

### Task 3 (PR 3, #221): player page

**Files:**

- Modify: `src/routes/seasons/[slug]/players/[id]/+page.svelte`, `+page.server.ts`
- Test: e2e specs that read the player page (`holiday-early`, `holiday-badge`, `early-pairings`, `report-flag`, `per-game` and others: grep for `players/`), `src/lib/server/pages.spec.ts`

- [ ] **Step 1: Update e2e first**, as in Task 2. The single list is `getByRole('list', { name: 'Matches this season' })`. Keep every behaviour the old sections proved: an early-unlocked match is visible to its two players only and carries "Early"; a revoked holiday's match carries "Holiday revoked"; an opponent on holiday shows "On holiday"; the viewer's own open matches show "Report".

- [ ] **Step 2: Loader.** Replace `upNext`, `matches` and `early` with one list: early cards first, then published cards, newest round first.

```ts
		// Early-unlocked matches first, then the season newest round first.
		matches: [...early.map((m) => matchCard(m, ctx)), ...cards.map((c) => c.card)].sort(
			(a, b) => Number(b.early) - Number(a.early) || Number(b.round) - Number(a.round)
		),
```

Remove what only `upNext` used. Update `pages.spec.ts` to the new shape.

- [ ] **Step 3: Markup.** One section replaces the three:

```svelte
<section aria-labelledby="matches-h">
	<div class="section-head">
		<h2 id="matches-h">Matches this season</h2>
		<span class="muted small">{played} of {data.matches.length} played</span>
	</div>
	{#if data.matches.length}
		<div class="panel rows">
			<MatchRows cards={data.matches} player={player.playerId} label="Matches this season" />
		</div>
	{:else}
		<p class="muted">The schedule appears once the groups are locked.</p>
	{/if}
</section>
```

`played` counts cards whose status is `reported` or `flagged`. Any explanatory copy the "Unlocked early" section carried stays as a line above the list when there are early matches.

- [ ] **Step 4: Verify and commit.** Full gate. `feat(player): one list of match rows on the player page`.

---

### Task 4 (PR 4, #222): season page

**Files:**

- Modify: `src/routes/seasons/[slug]/+page.svelte`, `+page.server.ts`
- Test: e2e specs that read the season page's own matches (grep for `Your matches this week`, `Up next`), `pages.spec.ts`

- [ ] **Step 1: Update e2e first**, as in Task 2. Lists: `Your matches this week`, `Up next`, `Your top-cut match`.

- [ ] **Step 2: Loader.** `topCut.myMatch` returns the whole card, not `.props`. `myWeek` and `ahead.matches` already hold cards.

- [ ] **Step 3: Markup.** Each of the three card grids becomes:

```svelte
<div class="panel rows narrow">
	<MatchRows cards={data.myWeek} player={user.id} label="Your matches this week" header={false} />
</div>
```

`narrow` caps the width at 760px. The top-cut match passes `[data.topCut.myMatch]`. Its round is the bracket name from `matchName()`: check it fits the 52px round column at wide widths and the narrow layout; if it doesn't, give the playoff row a short label in `matchCard()`'s `round` (README example: "QF 2") and cover it in `matchCard.spec.ts`. Bye notes and empty states stay as they are.

- [ ] **Step 4: Verify and commit.** Full gate. `feat(season): match rows on the season page`.

---

### Task 5 (PR 5, #223): public top-cut page

**Files:**

- Modify: `src/routes/seasons/[slug]/top-cut/+page.svelte` (and `+page.server.ts` only if the slot shape must change)
- Test: `e2e/top-cut.spec.ts`

- [ ] **Step 1: Update e2e first**, as in Task 2: a played bracket match shows its score in a row; a walkover shows "W/O" and "<name> advances".

- [ ] **Step 2: Markup.** The current round's slots with a match become one `MatchRows` list (`cards={slots with a card, mapped to s.card}`, label = the round's name). Bye and TBD slots keep their one-line text under the list. The bracket diagram itself is untouched.

- [ ] **Step 3: Verify and commit.** Full gate. `feat(topcut): match rows on the public top-cut page`.

---

## After the last PR merges

`MatchCard` remains in use on the match page and the admin pages. Remove CSS in `src/app.css` that no page uses any more (`.cards` variants, `.round`), in the PR that removes its last user.
