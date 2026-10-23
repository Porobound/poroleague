# Design Nits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the site in line with the owner's design pass of 2026-10-23: cut explanatory copy everywhere, tighten the phone season page, and close out #9.

**Architecture:** Copy edits in place (no new strings module). One new phone-only block on the season page: a compact progress card that replaces the full phase bar and deadline box on phones. Desktop layout is unchanged apart from copy.

**Tech Stack:** SvelteKit 3, Svelte 5, CSS.

**Design source:** Claude Design canvas "Poroleague Screens" (version `1792732341-ed9f`), read with Artifact `read`, `path: project/<Board>.dc.html`. Boards changed in this pass: Admin, AdminEndSeason, AdminMatches, AdminPlayers, AdminSeasonEdit, AdminSeasonNew, GroupPreview, Main, MobileSeason, MobileEmpty, MobileReport, MobileReportedAgainst, MobileSignup, MobileLogin, EmptyMyMatches, EmptyNoSeason, LoginFailed, LoginNotMember, LoginNotOrganizer, Report, ReportedAgainst, Schedule, Signup. The design system (`porobound.css`) hasn't changed since snapshot `1792700496-f308`; no re-sync.

**Decisions (made in planning, owner can overrule):**

- **Runs after Plan 10 merges.** Both plans touch the admin overview, the groups page and the season page. Branch from `main` once #27 is in, so the publish copy below lands on top of Plan 10's.
- **The owner's cuts are authoritative** (unlike earlier design copy). Where the site's sentence differs from the old board, apply the intent: drop the explanation, keep the fact.
- **"Logged in the public audit log" goes from every dialog.** The admin nav gets one line instead: "Every organizer action is logged there." under the audit link.
- **Scoring line goes** from under the standings ("Win 3 · Draw 1 · Loss 0 …"), as on the board. The top-cut legend becomes "Top {n} go to the top cut".
- **Phone season page:** the stat card replaces the phase bar and the deadline box below 640 px; the full phase bar stays one tap away under "All steps" (native `<details>`). The lede's double-loss sentence is desktop only.
- **Not changed:** boards whose site text already differs and isn't explanatory (archive empty state, draft season page); the flag notice on a flagged match.
- Already done before this plan (ticked on #9): organizer edit dialog with legends, dice and player names (`ResultFields.svelte`); "Leave as double loss" removed (#21); season name editable while in play.

---

## File structure

| File | Change |
| --- | --- |
| `src/routes/seasons/[slug]/admin/+layout.svelte` | Audit-log note in the admin nav |
| `src/lib/components/ResultActions.svelte` | Edit/enter/keep dialog copy |
| `src/routes/seasons/[slug]/admin/+page.svelte` | Publish dialog copy |
| `src/routes/seasons/[slug]/admin/matches/+page.svelte` | Intro |
| `src/routes/seasons/[slug]/admin/players/+page.svelte` | Intros, drop and remove dialogs |
| `src/routes/seasons/[slug]/admin/season/+page.svelte` | Lock note, end-of-season copy, dialogs |
| `src/routes/seasons/[slug]/admin/groups/+page.svelte` | Intro, lock dialog, locked notice |
| `src/lib/components/SeasonForm.svelte`, `src/routes/admin/+page.svelte` | Field hints, new-season intro |
| `src/routes/seasons/[slug]/+page.svelte` | Hero, signup, my matches, standings copy; phone stat card |
| `src/routes/seasons/[slug]/matches/[id]/+page.svelte`, `+page.server.ts` | Report and flag copy |
| `src/lib/league/report.ts`, `report.spec.ts` | Bo3 error |
| `src/routes/seasons/[slug]/schedule/+page.svelte`, `src/routes/+page.svelte`, `src/routes/login/*/+page.svelte` | Small cuts |
| `docs/spec.md` | Open items |

---

### Task 1: Admin copy

**Files:** the admin rows of the table above.

- [ ] **Step 1: Admin nav note**

In `src/routes/seasons/[slug]/admin/+layout.svelte`, right after the `Public audit log ↗` link (line 25):

```svelte
		<span class="muted small nav-note">Every organizer action is logged there.</span>
```

with, in its `<style>`: `.nav-note { padding: 4px 12px 0; line-height: 16px; }`. On phones the admin nav is a row of chips (Plan 9); hide the note there: `@media (max-width: 640px) { .nav-note { display: none; } }`.

- [ ] **Step 2: `ResultActions.svelte`**

Replace the edit dialog's `<p>` (lines 24–32) with:

```svelte
	<p>
		{r.p1.name} vs {r.p2.name}, round {r.round}.
		{r.flag
			? "This replaces the reported result. It can't be flagged again."
			: r.reported
				? 'This replaces the reported result.'
				: 'For a match that was played but never reported.'}
	</p>
```

and the keep dialog's body (lines 45–46) with: `The reported score stands. It can't be flagged again.`

- [ ] **Step 3: Publish dialog** (`admin/+page.svelte`, Plan 10's `ConfirmButton` body)

```svelte
				Players see the {p.count} pairings for {p.rounds[0] === p.rounds[1]
					? `round ${p.rounds[0]}`
					: `rounds ${p.rounds[0]}–${p.rounds[1]}`}{data.discord
					? ', and they’re posted in the pairings channel. Nobody is pinged'
					: ''}. It can't be undone.
```

- [ ] **Step 4: Matches, players**

- `admin/matches/+page.svelte` line 35 paragraph → `Overdue matches can still be reported. Unplayed ones become double losses at the deadline.`
- `admin/players/+page.svelte`: line 15 → `'You can remove players while signup is open.'`; line 17 → `'Dropping a player voids all their matches.'`; drop dialog body (lines ~76–79) → `All their matches are voided and they leave the standings.`; remove dialog body (~line 93) → `They can sign up again while signup is open.`

- [ ] **Step 5: Season admin** (`admin/season/+page.svelte`)

- Lock note (lines 32–35) → `Groups are locked, so slug, start date and rounds per week can't change.`
- End of season `<p>` (lines 50–54) →

```svelte
					{e.closed && season.deadline
						? `Reporting closed on ${date(season.deadline)} at 23:59 ${tzName(season.deadline)}.`
						: 'Every match is reported.'}
```

- Unplayed (line 68 paragraph) → `Unplayed matches are <strong>double losses</strong> unless you enter a result.`
- Open flags (lines 83–87): unchanged, it's already one short sentence with the overview link.
- Ties (line 102) → `Put tied players in order.`
- Finalize dialog (lines 194–195) → `Standings freeze and the season moves to the archive.`
- Open signup dialog (line 214) → `Anyone in the Porobound Discord can sign up.` (drop the "You can still edit …" sentence on line 215.)
- Save dialog hint (line 242) → drop the `Changes are logged …` sentence and the double-loss sentence; if nothing is left, remove the paragraph.

- [ ] **Step 6: Groups, new season, form hints**

- `admin/groups/+page.svelte` line 29 → `Drawn at random. Move players if needed, then lock. Locking builds the schedule and can't be undone.`; lock dialog (line 48) → `You can't move players between groups after this.`; locked notice (line 63) → `Groups locked. Publish week 1 from the overview.` with "overview" linking to `/seasons/{slug}/admin`.
- `src/routes/admin/+page.svelte` line 32 → `Nothing is public until you open signup.`
- `SeasonForm.svelte`: drop the `startDate` and `roundsPerWeek` hints; deadline hint → `'Ends 23:59 Helsinki time.'`; top cut hint → `'The top cut itself comes later.'`; locked fields show no hint (line 84: `{#if !locked && f.hint}<span class="pb-hint">{f.hint}</span>{/if}`).

- [ ] **Step 7: Check and commit**

Run: `npm run check` → 0 errors.

```bash
git add src/routes/seasons/[slug]/admin src/routes/admin src/lib/components
git commit -m "copy(admin): cut explanations, one audit-log note in the nav"
```

---

### Task 2: Public copy

**Files:** season page, match page, report rule, schedule, home, login pages.

- [ ] **Step 1: Bo3 error, test first**

In `src/lib/league/report.spec.ts`, change the expected message to `"That isn't a finished Bo3."`. Run `npx vitest run src/lib/league/report.spec.ts` → FAIL. Change `report.ts:31` to `errors.score = "That isn't a finished Bo3.";` → PASS.

- [ ] **Step 2: Season page** (`src/routes/seasons/[slug]/+page.svelte`)

- In-play lede (lines 42–46):

```svelte
					<p class="lede">
						This week: {roundsText(data.rounds)}. Play your matches by {day(data.weekEnds)} and report
						them here.<span class="desk"> Unplayed matches count as a double loss at the end of the season.</span>
					</p>
```

  with `.desk` hidden in the page's 640 px media query (`.desk { display: none; }`).
- Signup lede (line 60) → `Open to everyone in the Porobound Discord. One Bo3 per round, until the deadline.`
- Signup list: groups item (line 66) → `One group, or two if 16 or more sign up.`; "Play on your schedule" item → `<strong>{season.roundsPerWeek} rounds a week</strong><span>Deadlines are 23:59{season.deadline ? ` ${tzName(season.deadline)}` : ''}.</span>`; remove the "Report it yourself" `<li>`.
- Signed-up box (line 174) → `… <strong>{user.displayName}</strong>. You can withdraw until groups are drawn.`; withdraw dialog (line 183) → `You can sign up again while signup is open.`; remove the "You'll play as … your nickname on the server" `<p>` (line 186) and the "16 or more makes two groups" hint (line 152).
- Deadline box: remove the "Anything unplayed by then is a double loss." line (95).
- My matches: all-done block keeps `<strong>All done for this week</strong>` and the "See your results" link, and drops the `<span>` (line 117); bye `<span>` (line 134) → `No points either way.`
- Standings: no-results note (line 203) → `<strong>No results yet.</strong> Players are listed alphabetically for now.`; dropped line (239) → `… Their matches are void.`; replace the `Win 3 · Draw 1 …` legend (line 247) with nothing, and the top-cut legend text with `Top {season.topCutSize} go to the top cut`.

- [ ] **Step 3: Match page**

`matches/[id]/+page.svelte`: report confirm (line 179) → `Reports are final. If something's off, either of you can flag it.`; flag dialog help (line 219) → `Only organizers can change the result after a flag.`; remove `Looks right? Nothing to do.` (line 232). `+page.server.ts` flag message → `'Flagged. An organizer will check it.'`

- [ ] **Step 4: Small cuts**

- `schedule/+page.svelte` line 65: remove `Still playable until the season deadline.`
- `src/routes/+page.svelte` line 19: `It will be announced` → `It'll be announced`.
- `login/failed`: → `It was cancelled or Discord didn't answer. Try again.`
- `login/not-member`: → `Only members of the Porobound Discord can sign up or report. Try another Discord account.`; footnote → `Standings and results are public without logging in.`
- `login/not-organizer`: → `Admin pages need the organizer role in the Porobound Discord.` (keep "You can still report your own matches." if the page has it).

- [ ] **Step 5: Check, test, commit**

Run: `npm run check && npx vitest run` → 0 errors, all pass.

```bash
git add src
git commit -m "copy: cut explanations on public pages"
```

---

### Task 3: Phone season page

**Files:** `src/routes/seasons/[slug]/+page.svelte` (markup + style).

- [ ] **Step 1: Stat card markup**

After the hero `</section>`, before `<PhaseBar>`:

```svelte
	{#if season.status !== 'draft'}
		{@const now =
			data.phases.find((p) => p.state === 'current') ??
			data.phases.findLast((p) => p.state === 'done')}
		<div class="panel stat">
			{#if now}
				<div class="stat-head">
					<strong>{now.label}</strong>
					<span class="muted small">{now.detail}</span>
				</div>
			{/if}
			<div class="segs" aria-hidden="true">
				{#each data.phases as p (p.label)}<span class="seg-{p.state}"></span>{/each}
			</div>
			{#if season.deadline}
				<span class="stat-end"
					>{season.status === 'finished' || data.closed ? 'Season ended' : 'Season ends'}
					{date(season.deadline)} · 23:59 {tzName(season.deadline)}</span
				>
			{/if}
			<details class="steps">
				<summary>All steps</summary>
				<PhaseBar phases={data.phases} />
			</details>
		</div>
	{/if}
```

and give the existing `<PhaseBar>` and the `.deadline` panel a `desk-block` class (wrap the PhaseBar in `<div class="desk-block">`).

- [ ] **Step 2: Styles**

```css
	.stat {
		display: none;
	}
	@media (max-width: 640px) {
		.desk-block,
		.deadline {
			display: none;
		}
		.stat {
			display: flex;
			flex-direction: column;
			gap: 8px;
			padding: 12px 16px;
		}
		.stat-head {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 12px;
		}
		.segs {
			display: grid;
			grid-auto-flow: column;
			grid-auto-columns: minmax(0, 1fr);
			gap: 4px;
		}
		.segs span {
			height: 4px;
			border-radius: var(--radius-pill);
			background: var(--line);
		}
		.segs .seg-done {
			background: var(--accent);
		}
		.segs .seg-current {
			background: var(--brand);
		}
		.stat-end {
			font: 13px/18px var(--font-mono);
			color: var(--signal);
		}
		.steps > summary {
			cursor: pointer;
			font-size: 13px;
			color: var(--accent);
			min-height: 32px;
			display: inline-flex;
			align-items: center;
		}
		.hero h1 {
			font-size: 28px;
			line-height: 32px;
		}
	}
```

Remove the now-dead `.deadline` phone rules (lines ~384–388) and change the existing phone `.hero h1` 30/34 values to the ones above. In `src/app.css`'s phone block, the page's main padding/gap goes to 16px if it's larger (board: `padding: 16px; gap: 16px`).

- [ ] **Step 3: Check on a phone width**

Run: `npm run check` → 0 errors. Then `npm run mobile-check` against the owner's running dev server → no overflow failures; look at the season page screenshot: stat card, no phase list, no deadline box; "All steps" opens the vertical phase bar.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/seasons/[slug]/+page.svelte" src/app.css
git commit -m "feat(mobile): compact season progress card"
```

---

### Task 4: Spec and #9

- [ ] **Step 1:** `docs/spec.md` line 118: delete the "Design nits" open item. README status table: add this plan's row.
- [ ] **Step 2:** `npm run check && npx vitest run && npm run lint` → clean.
- [ ] **Step 3:** Commit `docs: design nits done`.
- [ ] **Step 4 (owner confirms):** tick the three open boxes on #9, comment that the edit dialog and double-loss items landed in #21 and the copy pass in this PR; the PR body says `Closes #9`.
