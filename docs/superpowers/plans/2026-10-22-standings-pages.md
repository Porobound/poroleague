# Standings & Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public read side of a season: standings, schedule, player page (per-legend record, this week's matches), legends page, archive, audit log.

**Architecture:** Two new pure modules (week math in `time.ts`, `legendStats.ts`) with Vitest. One pure `matchCard.ts` turns a DB match into `MatchCard` props so schedule and player pages share it. Pages are server-rendered; sorting, filtering and expand/collapse are query-string links and native `<details>`, no client JS. Standings live on `/seasons/[slug]` (spec has no separate standings route).

**Tech Stack:** SvelteKit 3 (Svelte 5 runes), Drizzle + better-sqlite3, Vitest.

**Design boards** (canvas in `design-artifacts` memory): `Standings`, `Schedule`, `Player`, `Legends`, `LegendsEmpty`, `Archive`, `EmptyArchive`, `PublicAudit`. Extract, don't paste: reuse `pb-` classes and `src/app.css` helpers.

**Deliberately skipped:** player page "Past seasons" aside (career stats deferred); header avatar → player page (season page links "Your page" instead); organizer marker in audit rows (audit stores no role; Plan 6 can add); client-side sorting/filters.

**Mirror matches:** on the legends page they count as picks but not in W-D-L or win % (a mirror is one win and one loss for the same legend). On the player page they count normally: a mirror is a real result for that player.

---

## File map

- Modify `src/lib/league/time.ts` (+spec): `weekOf`, `currentWeek`.
- Create `src/lib/league/legendStats.ts` (+spec): tallies per legend / player / opponent legend.
- Create `src/lib/format.ts`: `pct`, `date`, `when` display helpers.
- Create `src/lib/matchCard.ts`: DB match → `MatchCard` props + link.
- Modify `src/lib/components/MatchCard.svelte`: `overdue` status, `link` prop.
- Create `src/lib/components/StandingsTable.svelte`.
- Modify `src/lib/server/matches.ts`: `seasonMatches`, `seasonAudit`.
- Modify `src/lib/server/seasons.ts`: `seasonEntries` gains `dropped`/`tiebreak`; `publicSeason`; `groupStandings`.
- Modify `src/routes/+layout.svelte`: season nav + Archive.
- Modify `src/routes/seasons/[slug]/+page.server.ts` / `+page.svelte`: standings tables.
- Create `scripts/play-dev.ts`: dev data for a played season.
- Create routes: `seasons/+page`, `seasons/[slug]/schedule`, `seasons/[slug]/players/[id]`, `seasons/[slug]/legends`, `seasons/[slug]/audit` (each `+page.server.ts` + `+page.svelte`).

---

### Task 0: Dev script to play a season

The pages need a played season to look at. `db:seed-dev` signs players up and `db:report-dev` reports one match; this script fills a locked season with results.

**Files:**
- Create: `scripts/play-dev.ts`
- Modify: `package.json` (script), `README.md` (dev setup + commands table)

- [ ] **Step 1: Create `scripts/play-dev.ts`**

```ts
// Dev only: plays out a locked season with fake results so standings, schedule, legends and audit
// have data. Reports only dev-vs-dev matches, so your own matches stay yours to report.
// Same seed + same season = same results. Writes audit rows like the app; posts nothing to Discord.
import Database from 'better-sqlite3';
import { LEGENDS } from '#lib/legends.ts';

process.loadEnvFile();
const args = process.argv.slice(2);
const [slug, share = '0.6'] = args.filter((a) => !a.startsWith('--'));
if (!slug) throw new Error('usage: npm run db:play-dev -- <season-slug> [share=0.6] [--drop]');

const db = new Database(process.env.DATABASE_URL!);
const season = db.prepare('select id, status from seasons where slug = ?').get(slug) as
	| { id: number; status: string }
	| undefined;
if (!season) throw new Error(`No season with slug "${slug}"`);
if (season.status !== 'play') throw new Error(`"${slug}" isn't in play; lock the groups first.`);

// mulberry32: tiny seeded PRNG so reruns on a fresh season give the same picture.
let seed = season.id * 2654435761;
const rand = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

// Each dev player has a main legend and sometimes plays something else; a small pool makes mirrors.
const pool = LEGENDS.slice(0, 12);
const main = (id: string) => pool[Number(id.slice(4)) % pool.length];
const legendOf = (id: string) => (rand() < 0.75 ? main(id) : pick(pool));
const SCORES = [[2, 0], [2, 0], [2, 1], [2, 1], [1, 2], [0, 2], [1, 1]] as const;

type M = { id: number; p1_id: string; p2_id: string };
const open = db
	.prepare(
		`select id, p1_id, p2_id from matches where season_id = ? and reported_by is null
		 and p1_id like 'dev-%' and p2_id like 'dev-%' order by round, id`
	)
	.all(season.id) as M[];

const report = db.prepare(
	`update matches set p1_games = ?, p2_games = ?, p1_legend = ?, p2_legend = ?, dice_winner_id = ?,
	 reported_by = ?, reported_at = unixepoch() where id = ?`
);
const flag = db.prepare(`update matches set flagged_by = ?, flag_reason = ? where id = ?`);
const log = db.prepare(
	`insert into audit (season_id, match_id, actor_id, action, before, after) values (?, ?, ?, ?, ?, ?)`
);

// The first `share` of the schedule gets played, with ~10% left as gaps so some matches go overdue.
const played = open.slice(0, Math.round(open.length * Number(share))).filter(() => rand() > 0.1);
let flags = 0;
db.transaction(() => {
	for (const m of played) {
		const [p1Games, p2Games] = pick(SCORES);
		const r = {
			p1Games,
			p2Games,
			p1Legend: legendOf(m.p1_id),
			p2Legend: legendOf(m.p2_id),
			diceWinnerId: pick([m.p1_id, m.p2_id])
		};
		const by = pick([m.p1_id, m.p2_id]);
		report.run(r.p1Games, r.p2Games, r.p1Legend, r.p2Legend, r.diceWinnerId, by, m.id);
		log.run(season.id, m.id, by, 'report', null, JSON.stringify(r));
		if (rand() < 0.05) {
			const who = by === m.p1_id ? m.p2_id : m.p1_id;
			const reason = 'Wrong score, it was the other way round.';
			flag.run(who, reason, m.id);
			log.run(season.id, m.id, who, 'flag', null, JSON.stringify({ flagReason: reason }));
			flags++;
		}
	}
	// ponytail: --drop only flips the flag; Plan 6's drop action adds its audit row and webhook.
	if (args.includes('--drop'))
		db.prepare(
			`update entries set dropped = 1 where season_id = ? and player_id = (
			 select player_id from entries where season_id = ? and player_id like 'dev-%'
			 and dropped = 0 order by player_id desc limit 1)`
		).run(season.id, season.id);
})();
console.log(
	`Reported ${played.length} of ${open.length} open dev matches (${flags} flagged)` +
		(args.includes('--drop') ? ', dropped one dev player.' : '.')
);
```

- [ ] **Step 2: `package.json`** — after `db:report-dev` add `"db:play-dev": "node scripts/play-dev.ts"`.

- [ ] **Step 3: `README.md`** — in the dev setup, after the `db:report-dev` step, add:

````md
   To fill a locked season with results (only dev-vs-dev matches, so yours stay open):

   ```sh
   npm run db:play-dev -- <season-slug> [share]   # share of the schedule to play, default 0.6; --drop drops a dev player
   ```
````

and to the commands table: `| `npm run db:play-dev -- <slug> [share]`      | Dev: play out a season with fake results               |`

- [ ] **Step 4: Verify** on a scratch DB (never the owner's `local.db`): copy `local.db` to the scratchpad, run with `DATABASE_URL=<copy>` against a season in play, then `sqlite3 <copy> "select count(*), sum(p1_legend = p2_legend) from matches where reported_by is not null"`. Expected: reported count matches the script output, at least one mirror. Run it again: only new matches get reported (already-reported ones are skipped).

- [ ] **Step 5: Commit**

```bash
git add scripts/play-dev.ts package.json README.md
git commit -m "chore(dev): play-dev script fills a season with results"
```

---

### Task 1: Week math

**Files:**
- Modify: `src/lib/league/time.ts`
- Test: `src/lib/league/time.spec.ts`

- [ ] **Step 1: Write the failing test** — append to `time.spec.ts` and extend the import to `import { currentWeek, leagueDate, reportingClosed, weekOf } from './time';`

```ts
describe('weeks', () => {
	it('groups rounds into weeks', () => {
		expect([1, 2, 3, 4, 5].map((r) => weekOf(r, 2))).toEqual([1, 1, 2, 2, 3]);
	});
	it('counts weeks from the start date in league time', () => {
		expect(currentWeek('2026-11-02', new Date('2026-11-01T12:00:00Z'))).toBe(0);
		expect(currentWeek('2026-11-02', new Date('2026-11-01T22:30:00Z'))).toBe(1); // 00:30 Helsinki
		expect(currentWeek('2026-11-02', new Date('2026-11-08T12:00:00Z'))).toBe(1);
		expect(currentWeek('2026-11-02', new Date('2026-11-09T12:00:00Z'))).toBe(2);
		expect(currentWeek(null, new Date())).toBe(0);
	});
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/league/time.spec.ts` — Expected: FAIL (`weekOf` is not exported).

- [ ] **Step 3: Implement** — append to `time.ts`:

```ts
const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
	(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;

export const weekOf = (round: number, roundsPerWeek: number) => Math.ceil(round / roundsPerWeek);

// Week 1 starts on the start date (league time); 0 before the season starts.
export const currentWeek = (startDate: string | null, now: Date) =>
	startDate ? Math.max(0, Math.floor(daysBetween(startDate, leagueDate(now)) / 7) + 1) : 0;
```

A match is **overdue** when unreported, not void and `weekOf(round) < currentWeek`. Derived at the call site (Task 4), no stored state.

- [ ] **Step 4: Run** `npx vitest run src/lib/league/time.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/league/time.ts src/lib/league/time.spec.ts
git commit -m "feat(league): week of a round, current week"
```

---

### Task 2: Legend stats

**Files:**
- Create: `src/lib/league/legendStats.ts`
- Test: `src/lib/league/legendStats.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
	gameWinPct,
	legendMatches,
	legendPlayers,
	legendStats,
	matchWinPct,
	playerLegends,
	type LegendMatch
} from './legendStats';

const m = (p1: string, l1: string, g1: number, g2: number, l2: string, p2: string): LegendMatch => ({
	p1Id: p1,
	p2Id: p2,
	p1Games: g1,
	p2Games: g2,
	p1Legend: l1,
	p2Legend: l2
});
const ms = [
	m('a', 'Jinx', 2, 0, 'Ahri', 'b'),
	m('a', 'Jinx', 1, 1, 'Ahri', 'c'),
	m('b', 'Jinx', 2, 1, 'Jinx', 'c'), // mirror
	m('c', 'Ahri', 2, 1, 'Jinx', 'd')
];
const pick = ({ key, picks, mirrors, wins, draws, losses, gameWins, gameLosses }: any) => ({
	key,
	picks,
	mirrors,
	wins,
	draws,
	losses,
	gameWins,
	gameLosses
});

describe('legendStats', () => {
	it('tallies picks per legend; mirrors count as picks only', () => {
		const rows = legendStats(ms);
		expect(rows.map(pick)).toEqual([
			{ key: 'Jinx', picks: 5, mirrors: 2, wins: 1, draws: 1, losses: 1, gameWins: 4, gameLosses: 3 },
			{ key: 'Ahri', picks: 3, mirrors: 0, wins: 1, draws: 1, losses: 1, gameWins: 3, gameLosses: 4 }
		]);
		expect(rows.map((r) => r.players.size)).toEqual([4, 2]);
	});

	it('hides win % under 5 non-mirror matches unless asked', () => {
		const [jinx] = legendStats(ms);
		expect(matchWinPct(jinx)).toBeNull();
		expect(gameWinPct(jinx)).toBeNull();
		expect(matchWinPct(jinx, 0)).toBeCloseTo(1 / 3);
		expect(gameWinPct(jinx, 0)).toBeCloseTo(4 / 7);
	});

	it('lists the players of one legend', () => {
		expect(legendPlayers(ms, 'Jinx').map(pick)).toEqual([
			{ key: 'a', picks: 2, mirrors: 0, wins: 1, draws: 1, losses: 0, gameWins: 3, gameLosses: 1 },
			{ key: 'b', picks: 1, mirrors: 1, wins: 0, draws: 0, losses: 0, gameWins: 0, gameLosses: 0 },
			{ key: 'c', picks: 1, mirrors: 1, wins: 0, draws: 0, losses: 0, gameWins: 0, gameLosses: 0 },
			{ key: 'd', picks: 1, mirrors: 0, wins: 0, draws: 0, losses: 1, gameWins: 1, gameLosses: 2 }
		]);
	});

	it("splits a player's record by own and opponent legend, mirrors included", () => {
		const { playedAs, against } = playerLegends(ms, 'c');
		expect(playedAs.map((r) => [r.key, r.picks, r.wins, r.draws, r.losses])).toEqual([
			['Ahri', 2, 1, 1, 0],
			['Jinx', 1, 0, 0, 1] // mirror lost to b counts for the player
		]);
		expect(against.map((r) => [r.key, r.picks, r.wins, r.draws, r.losses])).toEqual([
			['Jinx', 3, 1, 1, 1]
		]);
	});

	it('leaves out unplayed and void matches', () => {
		const raw = [
			{ ...ms[0] },
			{ ...ms[1], p1Games: null, p2Games: null, p1Legend: null, p2Legend: null },
			{ ...ms[3] }
		];
		expect(legendMatches(raw, new Set(['d']))).toEqual([ms[0]]);
	});
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/league/legendStats.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/league/legendStats.ts`

```ts
import { matchPoints } from './score';

export type LegendMatch = {
	p1Id: string;
	p2Id: string;
	p1Games: number;
	p2Games: number;
	p1Legend: string;
	p2Legend: string;
};
type Maybe = { [K in keyof LegendMatch]: LegendMatch[K] | null };

export type Tally = {
	key: string;
	players: Set<string>;
	picks: number;
	mirrors: number;
	wins: number;
	draws: number;
	losses: number;
	gameWins: number;
	gameLosses: number;
};

// Legend stats leave out void matches (a player dropped) and unplayed ones, which covers deadline
// double losses.
export const legendMatches = <M extends Maybe>(ms: M[], dropped: Set<string>) =>
	ms.filter(
		(m): m is M & LegendMatch =>
			m.p1Games !== null &&
			m.p2Games !== null &&
			!!m.p1Legend &&
			!!m.p2Legend &&
			!dropped.has(m.p1Id!) &&
			!dropped.has(m.p2Id!)
	);

type Side = { playerId: string; legend: string; vs: string; won: number; lost: number };
const sides = (ms: LegendMatch[]): Side[] =>
	ms.flatMap((m) => [
		{ playerId: m.p1Id, legend: m.p1Legend, vs: m.p2Legend, won: m.p1Games, lost: m.p2Games },
		{ playerId: m.p2Id, legend: m.p2Legend, vs: m.p1Legend, won: m.p2Games, lost: m.p1Games }
	]);

// In legend-wide stats a mirror is a pick, never a result (its win and loss cancel out).
// For one player's record it's a real result.
function group(list: Side[], key: (s: Side) => string, mirrorsCount = false): Tally[] {
	const rows = new Map<string, Tally>();
	for (const s of list) {
		const k = key(s);
		let t = rows.get(k);
		if (!t) {
			t = { key: k, players: new Set(), picks: 0, mirrors: 0, wins: 0, draws: 0, losses: 0, gameWins: 0, gameLosses: 0 };
			rows.set(k, t);
		}
		t.players.add(s.playerId);
		t.picks++;
		if (s.legend === s.vs) {
			t.mirrors++;
			if (!mirrorsCount) continue;
		}
		const [points] = matchPoints(s.won, s.lost);
		if (points === 3) t.wins++;
		else if (points === 1) t.draws++;
		else t.losses++;
		t.gameWins += s.won;
		t.gameLosses += s.lost;
	}
	return [...rows.values()].sort((a, b) => b.picks - a.picks || a.key.localeCompare(b.key));
}

export const legendStats = (ms: LegendMatch[]) => group(sides(ms), (s) => s.legend);

export const legendPlayers = (ms: LegendMatch[], legend: string) =>
	group(
		sides(ms).filter((s) => s.legend === legend),
		(s) => s.playerId
	);

export function playerLegends(ms: LegendMatch[], playerId: string) {
	const mine = sides(ms).filter((s) => s.playerId === playerId);
	return {
		playedAs: group(mine, (s) => s.legend, true),
		against: group(mine, (s) => s.vs, true)
	};
}

export const MIN_RATED = 5;
export const results = (t: Tally) => t.wins + t.draws + t.losses;

// null = not enough non-mirror matches to show a rate.
export const matchWinPct = (t: Tally, min = MIN_RATED) =>
	results(t) >= Math.max(min, 1) ? t.wins / results(t) : null;
export const gameWinPct = (t: Tally, min = MIN_RATED) =>
	results(t) >= Math.max(min, 1) ? t.gameWins / (t.gameWins + t.gameLosses) : null;
```

- [ ] **Step 4: Run** `npx vitest run src/lib/league/legendStats.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/league/legendStats.ts src/lib/league/legendStats.spec.ts
git commit -m "feat(league): legend stats; mirrors are picks, results per player"
```

---

### Task 3: Data helpers and site nav

**Files:**
- Modify: `src/lib/server/matches.ts`, `src/lib/server/seasons.ts`, `src/routes/+layout.svelte`
- Create: `src/lib/format.ts`

- [ ] **Step 1: `seasonMatches` in `matches.ts`** (after `playerMatches`):

```ts
export const seasonMatches = (seasonId: number) =>
	db
		.select()
		.from(matches)
		.where(eq(matches.seasonId, seasonId))
		.orderBy(asc(matches.group), asc(matches.round), asc(matches.id))
		.all();
```

- [ ] **Step 2: `seasons.ts`** — add `dropped: entries.dropped, tiebreak: entries.tiebreak` to the `seasonEntries` select. Then add, with imports `import { standings } from '#lib/league/standings.ts';`, `import { reportingClosed } from '#lib/league/time.ts';`, `import { seasonMatches } from '#lib/server/matches.ts';`:

```ts
// Season sub-pages have nothing to show for a draft; only the season page previews drafts.
export function publicSeason(slug: string, viewer: App.Locals['user']): Season {
	const season = getSeason(slug, viewer);
	if (season.status === 'draft') error(404, 'Season not found');
	return season;
}

export function groupStandings(season: Season, list: SeasonEntry[]) {
	const all = seasonMatches(season.id);
	const closed = reportingClosed(season.deadline, new Date());
	return groupsOf(list).map((g, i) => {
		const by = new Map(g.map((e) => [e.playerId, e]));
		const ms = all.filter((m) => m.group === i + 1);
		const results = ms.map((m) => ({ p1: m.p1Id, p2: m.p2Id, p1Games: m.p1Games, p2Games: m.p2Games }));
		return {
			group: i + 1,
			size: g.length,
			rounds: Math.max(0, ...ms.map((m) => m.round)),
			dropped: g.filter((e) => e.dropped),
			rows: standings(g, results, closed).map((r) => ({
				...r,
				name: by.get(r.playerId)!.displayName,
				avatar: by.get(r.playerId)!.avatar
			}))
		};
	});
}
export type GroupStanding = ReturnType<typeof groupStandings>[number];
```

- [ ] **Step 3: Create `src/lib/format.ts`**

```ts
import { LEAGUE_TZ } from '#lib/league/time.ts';

export const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

export const date = (d: string | null) =>
	d
		? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
				day: 'numeric',
				month: 'short',
				year: 'numeric'
			})
		: '';

const whenFmt = new Intl.DateTimeFormat('en-GB', {
	timeZone: LEAGUE_TZ,
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
	timeZoneName: 'short'
});
export const when = (d: Date) => whenFmt.format(d);
```

Replace the local `date` helper in `src/routes/seasons/[slug]/+page.svelte` with `import { date } from '#lib/format.ts';`.

- [ ] **Step 4: Nav** — in `src/routes/+layout.svelte` script add:

```ts
const slug = $derived(page.params.slug);
const here = (href: string) => (page.url.pathname === href ? 'page' : undefined);
```

and right after the brand link:

```svelte
{#if slug}
	{#each [['', 'Season'], ['/schedule', 'Schedule'], ['/legends', 'Legends']] as [path, label] (path)}
		<a href="/seasons/{slug}{path}" class="nav-link" aria-current={here(`/seasons/${slug}${path}`)}>{label}</a>
	{/each}
{/if}
<a href="/seasons" class="nav-link" aria-current={here('/seasons')}>Archive</a>
```

- [ ] **Step 5: Verify** `npm run check` — Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server src/lib/format.ts src/routes/+layout.svelte src/routes/seasons/[slug]/+page.svelte
git commit -m "feat: season data helpers, season nav"
```

---

### Task 4: Shared match cards

**Files:**
- Create: `src/lib/matchCard.ts`
- Modify: `src/lib/components/MatchCard.svelte`

- [ ] **Step 1: `MatchCard.svelte`** — add `'overdue'` to the `status` union and `link?: { href: string; label: string }` (default `undefined`) to props; add `overdue: ['pb-badge-rank', 'Overdue']` to `BADGE`; replace the foot block with:

```svelte
{#if note || link}
	<div class="pb-match-foot">
		<span class="pb-match-note">{note}</span>
		{#if link}<a href={link.href}>{link.label}</a>{/if}
	</div>
{/if}
```

- [ ] **Step 2: Create `src/lib/matchCard.ts`**

```ts
import { matchMode } from '#lib/league/report.ts';
import { currentWeek, reportingClosed, weekOf } from '#lib/league/time.ts';
import { groupName } from '#lib/season.ts';

export type CardMatch = {
	id: number;
	group: number | null;
	round: number;
	p1Id: string;
	p2Id: string;
	p1Games: number | null;
	p2Games: number | null;
	p1Legend: string | null;
	p2Legend: string | null;
	diceWinnerId: string | null;
	reportedBy: string | null;
	flaggedBy: string | null;
};
type Person = { playerId: string; displayName: string; avatar: string | null; dropped: boolean };
type CardSeason = {
	slug: string;
	status: string;
	deadline: string | null;
	startDate: string | null;
	roundsPerWeek: number;
};
export type Status = 'scheduled' | 'reported' | 'flagged' | 'void' | 'overdue';

// Everything a page needs to turn matches into cards, built once per request.
export function cardContext(season: CardSeason, people: Person[], viewerId: string | null, now = new Date()) {
	return {
		season,
		viewerId,
		people: new Map(people.map((p) => [p.playerId, p])),
		dropped: new Set(people.filter((p) => p.dropped).map((p) => p.playerId)),
		week: currentWeek(season.startDate, now),
		closed: reportingClosed(season.deadline, now)
	};
}
export type CardContext = ReturnType<typeof cardContext>;

export function matchCard(m: CardMatch, c: CardContext) {
	const voided = c.dropped.has(m.p1Id) || c.dropped.has(m.p2Id);
	const overdue = !m.reportedBy && !voided && weekOf(m.round, c.season.roundsPerWeek) < c.week;
	const status: Status = voided
		? 'void'
		: m.flaggedBy
			? 'flagged'
			: m.reportedBy
				? 'reported'
				: overdue
					? 'overdue'
					: 'scheduled';
	const person = (id: string) => c.people.get(id);
	const side = (id: string, legend: string | null, games: number | null) => ({
		name: person(id)?.displayName ?? 'Unknown',
		avatar: person(id)?.avatar ?? null,
		legend,
		games
	});
	const mode = matchMode(m, {
		viewerId: c.viewerId,
		inPlay: c.season.status === 'play',
		closed: c.closed,
		voided
	});
	return {
		id: m.id,
		mine: m.p1Id === c.viewerId || m.p2Id === c.viewerId,
		status,
		props: {
			head: `${m.group ? `${groupName(m.group)} · ` : ''}Round ${m.round}`,
			sides: [side(m.p1Id, m.p1Legend, m.p1Games), side(m.p2Id, m.p2Legend, m.p2Games)] as [
				ReturnType<typeof side>,
				ReturnType<typeof side>
			],
			dice: (m.diceWinnerId === m.p1Id ? 0 : m.diceWinnerId === m.p2Id ? 1 : null) as 0 | 1 | null,
			status,
			note: voided
				? 'Void: a player dropped'
				: m.reportedBy
					? `Reported by ${person(m.reportedBy)?.displayName ?? 'an organizer'}`
					: '',
			link: {
				href: `/seasons/${c.season.slug}/matches/${m.id}`,
				label: mode === 'report' ? 'Report' : 'View'
			}
		}
	};
}
export type Card = ReturnType<typeof matchCard>;
```

Pages render a card as `<MatchCard {...card.props} />`.

- [ ] **Step 3: Verify** `npm run check` — Expected: 0 errors (the match page still passes no `link`, which is optional).

- [ ] **Step 4: Commit**

```bash
git add src/lib/matchCard.ts src/lib/components/MatchCard.svelte
git commit -m "feat: shared match cards with overdue and links"
```

---

### Task 5: Standings on the season page

**Files:**
- Create: `src/lib/components/StandingsTable.svelte`
- Modify: `src/routes/seasons/[slug]/+page.server.ts`, `src/routes/seasons/[slug]/+page.svelte`

- [ ] **Step 1: `StandingsTable.svelte`**

```svelte
<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import { pct } from '#lib/format.ts';
	import type { GroupStanding } from '#lib/server/seasons.ts';

	let {
		rows,
		cut,
		slug,
		me = null
	}: { rows: GroupStanding['rows']; cut: number; slug: string; me?: string | null } = $props();
</script>

<table class="pb-table">
	<thead>
		<tr>
			<th class="pb-num">#</th>
			<th>Player</th>
			<th class="pb-num">P</th>
			<th class="pb-num pb-opt">W</th>
			<th class="pb-num pb-opt">D</th>
			<th class="pb-num pb-opt">L</th>
			<th class="pb-num">GW%</th>
			<th class="pb-num">Pts</th>
		</tr>
	</thead>
	<tbody>
		{#each rows as r, i (r.playerId)}
			<tr class={[r.playerId === me && 'is-me', i + 1 === cut && i + 1 < rows.length && 'is-cut']}>
				<td class={['pb-rank', i === 0 && r.played > 0 && 'is-podium']}>{i + 1}</td>
				<td class="pb-player-cell">
					<a class="pb-player" href="/seasons/{slug}/players/{r.playerId}">
						<Avatar name={r.name} src={r.avatar} size={24} />
						<span class="pb-player-name">{r.name}</span>
						{#if r.unresolvedTie}<span class="pb-tie" title="Tied: an organizer decides">Tie</span>{/if}
					</a>
				</td>
				<td class="pb-num">{r.played}</td>
				<td class="pb-num pb-opt">{r.wins}</td>
				<td class="pb-num pb-opt">{r.draws}</td>
				<td class="pb-num pb-opt">{r.losses}</td>
				<td class="pb-num">{r.played ? pct(r.gwp) : '—'}</td>
				<td class="pb-num pb-pts">{r.points}</td>
			</tr>
		{/each}
	</tbody>
</table>
```

`StandingsTable` imports only the *type* from `#lib/server/seasons.ts`; `import type` is erased, so no server code reaches the client. If SvelteKit's server-import guard still complains, move `GroupStanding` to `src/lib/season.ts` as a structural type.

- [ ] **Step 2: `+page.server.ts`** — import `groupStandings`, drop `groupsOf`; replace the `groups:` line with:

```ts
groups: season.status === 'play' || season.status === 'finished' ? groupStandings(season, list) : [],
```

- [ ] **Step 3: `+page.svelte`** — import `StandingsTable`; replace the `{#if data.groups.length}` grid block (keep the `{:else if data.entries.length}` players list) with:

```svelte
{#if data.groups.length}
	<p class="muted small">
		Win 3 · Draw 1 · Loss 0. Ties break on points, then head-to-head, then game-win %, then an
		organizer decision.
	</p>
	<div class="grid-2">
		{#each data.groups as g (g.group)}
			<section class="panel standings">
				<h2>{groupName(g.group)}</h2>
				<span class="muted small">
					{g.size} players · {g.rounds} rounds{g.dropped.length ? ` · ${g.dropped.length} dropped` : ''}
				</span>
				<StandingsTable rows={g.rows} cut={season.topCutSize ?? 0} slug={season.slug} me={user?.id} />
				{#if g.dropped.length}
					<p class="muted small">
						Dropped: {g.dropped.map((e) => e.displayName).join(', ')}. Their matches are void and
						left out of standings.
					</p>
				{/if}
			</section>
		{/each}
	</div>
	<p class="small">
		{#if season.topCutSize}<span class="muted">Dashed line: top {season.topCutSize} per group (top cut comes later).</span>{/if}
		<a href="/seasons/{season.slug}/audit">Audit log</a>
	</p>
```

In the "Your matches" panel, change the heading to `<h2>Your matches <a class="small" href="/seasons/{season.slug}/players/{user?.id}">Your page</a></h2>`. Add to the `<style>` block: `.standings { overflow-x: auto; }`.

- [ ] **Step 4: Verify** `npm run check` — 0 errors. Smoke test (Task 11) covers rendering.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/StandingsTable.svelte src/routes/seasons/[slug]
git commit -m "feat: group standings on the season page"
```

---

### Task 6: Schedule page

**Files:**
- Create: `src/routes/seasons/[slug]/schedule/+page.server.ts`, `+page.svelte`

- [ ] **Step 1: `+page.server.ts`**

```ts
import { weekOf } from '#lib/league/time.ts';
import { cardContext, matchCard, type Card } from '#lib/matchCard.ts';
import { groupName } from '#lib/season.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import { publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	const ctx = cardContext(season, seasonEntries(season.id), locals.user?.id ?? null);
	const all = seasonMatches(season.id);
	const rpw = season.roundsPerWeek;
	const weeks = Math.max(0, ...all.map((m) => weekOf(m.round, rpw)));
	const asked = Number(url.searchParams.get('week'));
	const week = Math.min(weeks, Math.max(1, Number.isInteger(asked) && asked > 0 ? asked : ctx.week));
	const groups = Math.max(0, ...all.map((m) => m.group ?? 0));
	const group = Number(url.searchParams.get('group')) || 0;
	const mine = !!locals.user && url.searchParams.has('mine');

	const cards = all
		.filter((m) => !group || m.group === group)
		.map((m) => ({ m, card: matchCard(m, ctx) }));
	const show = (c: Card) => !mine || c.mine;

	const sections = new Map<string, Card[]>();
	for (const { m, card } of cards) {
		if (weekOf(m.round, rpw) !== week) continue;
		const title = `${m.group ? `${groupName(m.group)} · ` : ''}Round ${m.round}`;
		sections.set(title, [...(sections.get(title) ?? []), card]);
	}

	return {
		season,
		week,
		currentWeek: ctx.week,
		weeks: Array.from({ length: weeks }, (_, i) => {
			const first = i * rpw + 1;
			const last = Math.min((i + 1) * rpw, Math.max(...all.map((m) => m.round)));
			return { n: i + 1, label: `Week ${i + 1} · R${first}${last > first ? `–${last}` : ''}` };
		}),
		groups: Array.from({ length: groups }, (_, i) => ({ n: i + 1, label: groupName(i + 1) })),
		group,
		mine,
		overdue: cards.map((c) => c.card).filter((c) => c.status === 'overdue' && show(c)),
		sections: [...sections].map(([title, list]) => {
			const count = (s: string) => list.filter((c) => c.status === s).length;
			const voids = count('void');
			return {
				title,
				total: list.length - voids,
				done: count('reported') + count('flagged'),
				flagged: count('flagged'),
				voids,
				hasMine: list.some((c) => c.mine),
				cards: list.filter(show)
			};
		})
	};
};
```

- [ ] **Step 2: `+page.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import { date } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const season = $derived(data.season);
	const q = (key: string, value: string | number | null) => {
		const u = new URLSearchParams(page.url.searchParams);
		if (value === null) u.delete(key);
		else u.set(key, String(value));
		return `?${u}`;
	};
	const shown = $derived(data.sections.filter((s) => s.cards.length));
</script>

<svelte:head>
	<title>Schedule · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">
		{season.name} · {season.roundsPerWeek} rounds a week · season ends {date(season.deadline)} 23:59
		Helsinki time
	</span>
	<h1>Schedule</h1>

	{#if !data.weeks.length}
		<p class="status">The schedule appears once the groups are locked.</p>
	{:else}
		<div class="toolbar">
			<nav aria-label="Weeks" class="seg">
				{#each data.weeks as w (w.n)}
					<a href={q('week', w.n)} aria-current={w.n === data.week ? 'true' : undefined}>
						{w.label}{w.n === data.currentWeek ? ' (now)' : ''}
					</a>
				{/each}
			</nav>
			<div class="seg" role="group" aria-label="Filter">
				{#if data.groups.length > 1}
					<a href={q('group', null)} aria-current={!data.group ? 'true' : undefined}>All groups</a>
					{#each data.groups as g (g.n)}
						<a href={q('group', g.n)} aria-current={data.group === g.n ? 'true' : undefined}>{g.label}</a>
					{/each}
				{/if}
				{#if data.user}
					<a href={q('mine', data.mine ? null : '1')} aria-current={data.mine ? 'true' : undefined}>
						Only my matches
					</a>
				{/if}
			</div>
		</div>

		{#if data.overdue.length}
			<section class="overdue">
				<h2>Overdue from earlier weeks</h2>
				<p class="muted">Still playable until the season deadline.</p>
				<div class="cards">
					{#each data.overdue as c (c.id)}<MatchCard {...c.props} />{/each}
				</div>
			</section>
		{/if}

		{#each shown as s (s.title)}
			<details class="panel round" open>
				<summary>
					<h2>{s.title}</h2>
					{#if s.hasMine}<span class="pb-badge pb-badge-rank">Your match</span>{/if}
					<span class="muted small grow-left">
						<span class="pb-num">{s.done}/{s.total}</span> reported{#if s.flagged}
							· {s.flagged} flagged{/if}{#if s.voids} · {s.voids} void{/if}
					</span>
				</summary>
				<div class="cards">
					{#each s.cards as c (c.id)}<MatchCard {...c.props} />{/each}
				</div>
			</details>
		{:else}
			<p class="status">No matches for you in this view.</p>
		{/each}
	{/if}
</div>
```

- [ ] **Step 3: Shared styles** — append to `src/app.css` (Task 7 and 8 reuse `.cards`, `.seg`, `.toolbar`, `.stats`):

```css
.toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 12px 16px;
	justify-content: space-between;
	align-items: center;
}
.seg {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 4px;
	background: var(--surface-raised);
	border: 1px solid var(--line);
	border-radius: var(--radius-md);
	padding: 4px;
	max-width: 100%;
	overflow-x: auto;
}
.seg a {
	padding: 8px 14px;
	border-radius: var(--radius-sm);
	color: var(--ink-muted);
	text-decoration: none;
	font: 500 14px/20px var(--font-sans);
	white-space: nowrap;
}
.seg a[aria-current] {
	background: var(--frost);
	color: var(--ink);
	font-weight: 600;
}
.cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 16px;
}
.round summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 16px;
	cursor: pointer;
}
.round summary h2 {
	margin: 0;
}
.round[open] summary {
	margin-bottom: 16px;
}
.grow-left {
	margin-left: auto;
}
.overdue {
	display: flex;
	flex-direction: column;
	gap: 12px;
	border-left: 3px solid var(--signal);
	padding-left: 16px;
}
.overdue h2,
.overdue p {
	margin: 0;
}
.stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 16px;
}
.stats .panel {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.stats strong {
	font: 500 28px/32px var(--font-mono);
}
```

- [ ] **Step 4: Verify** `npm run check` — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/seasons/[slug]/schedule src/app.css
git commit -m "feat: schedule page with weeks, overdue and filters"
```

---

### Task 7: Player page

**Files:**
- Create: `src/routes/seasons/[slug]/players/[id]/+page.server.ts`, `+page.svelte`

- [ ] **Step 1: `+page.server.ts`**

```ts
import { error } from '@sveltejs/kit';
import { legendMatches, playerLegends } from '#lib/league/legendStats.ts';
import { weekOf } from '#lib/league/time.ts';
import { cardContext, matchCard } from '#lib/matchCard.ts';
import { playerMatches } from '#lib/server/matches.ts';
import { groupStandings, publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const season = publicSeason(params.slug, locals.user);
	const list = seasonEntries(season.id);
	const player = list.find((e) => e.playerId === params.id) ?? error(404, 'Player not found');
	const ctx = cardContext(season, list, locals.user?.id ?? null);
	const ms = playerMatches(season.id, player.playerId);
	const cards = ms.map((m) => ({ week: weekOf(m.round, season.roundsPerWeek), card: matchCard(m, ctx) }));
	const counted = legendMatches(ms, ctx.dropped);
	const standing = groupStandings(season, list).find((g) => g.group === player.group);
	const rank = standing?.rows.findIndex((r) => r.playerId === player.playerId) ?? -1;

	return {
		season,
		player,
		row: rank >= 0 ? standing!.rows[rank] : null,
		rank: rank + 1,
		dice: { won: counted.filter((m) => m.diceWinnerId === player.playerId).length, of: counted.length },
		thisWeek: cards
			.filter((c) => c.card.status === 'overdue' || (c.week === ctx.week && c.card.status === 'scheduled'))
			.map((c) => c.card),
		matches: cards.map((c) => c.card),
		legends: playerLegends(counted, player.playerId)
	};
};
```

- [ ] **Step 2: `+page.svelte`**

```svelte
<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import { pct } from '#lib/format.ts';
	import { gameWinPct } from '#lib/league/legendStats.ts';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const { season, player, row } = $derived(data);
	const isMe = $derived(data.user?.id === player.playerId);
</script>

<svelte:head>
	<title>{player.displayName} · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<section class="player-head">
		<Avatar name={player.displayName} src={player.avatar} size={72} />
		<div>
			<h1>{player.displayName}</h1>
			<div class="badges">
				{#if player.group}<span class="pb-badge">{groupName(player.group)}</span>{/if}
				{#if player.dropped}
					<span class="pb-badge pb-badge-loss">Dropped</span>
				{:else if row}
					<span class="pb-badge pb-badge-rank">#{data.rank} in group</span>
				{/if}
				<span class="muted small">{season.name}</span>
			</div>
		</div>
	</section>

	{#if row}
		<section class="stats" aria-label="Season stats">
			<div class="panel"><span class="eyebrow">Points</span><strong>{row.points}</strong></div>
			<div class="panel">
				<span class="eyebrow">W–D–L</span><strong>{row.wins}–{row.draws}–{row.losses}</strong>
			</div>
			<div class="panel">
				<span class="eyebrow">Game-win %</span><strong>{row.played ? pct(row.gwp) : '—'}</strong>
			</div>
			<div class="panel">
				<span class="eyebrow">Dice rolls won</span><strong>{data.dice.won} / {data.dice.of}</strong>
			</div>
		</section>
	{/if}

	{#if data.thisWeek.length}
		<section>
			<h2>{isMe ? 'Who you play this week' : 'This week'}</h2>
			<div class="cards">
				{#each data.thisWeek as c (c.id)}<MatchCard {...c.props} />{/each}
			</div>
		</section>
	{/if}

	<section>
		<h2>Matches this season</h2>
		{#if data.matches.length}
			<div class="cards">
				{#each data.matches as c (c.id)}<MatchCard {...c.props} />{/each}
			</div>
		{:else}
			<p class="muted">The schedule appears once the groups are locked.</p>
		{/if}
	</section>

	<section>
		<h2>Legends <a class="small" href="/seasons/{season.slug}/legends">All legends this season</a></h2>
		{#if data.legends.playedAs.length}
			<div class="grid-2">
				{#each [['Played as', 'Legend', data.legends.playedAs], ['Against', 'Opponent legend', data.legends.against]] as const as [title, col, rows] (title)}
					<div class="panel">
						<table class="pb-table">
							<caption><h3>{title}</h3></caption>
							<thead>
								<tr>
									<th>{col}</th>
									<th class="pb-num">M</th>
									<th class="pb-num">W–D–L</th>
									<th class="pb-num">GW%</th>
								</tr>
							</thead>
							<tbody>
								{#each rows as r (r.key)}
									<tr>
										<th scope="row">{r.key}</th>
										<td class="pb-num">{r.picks}</td>
										<td class="pb-num">{r.wins}–{r.draws}–{r.losses}</td>
										<td class="pb-num">{pct(gameWinPct(r, 0))}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/each}
			</div>
		{:else}
			<p class="status">No reported matches yet.</p>
		{/if}
	</section>
</div>

<style>
	.player-head {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		align-items: center;
	}
	.player-head h1 {
		margin: 0 0 6px;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	caption {
		text-align: left;
	}
	caption h3 {
		margin: 0 0 4px;
	}
</style>
```

- [ ] **Step 3: Verify** `npm run check` — 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/seasons/[slug]/players
git commit -m "feat: player page with this week and legend record"
```

---

### Task 8: Legends page

**Files:**
- Create: `src/routes/seasons/[slug]/legends/+page.server.ts`, `+page.svelte`

- [ ] **Step 1: `+page.server.ts`**

```ts
import {
	gameWinPct,
	legendMatches,
	legendPlayers,
	legendStats,
	matchWinPct,
	type Tally
} from '#lib/league/legendStats.ts';
import { LEGENDS } from '#lib/legends.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import { publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

// Unrated legends (under 5 matches) sort below every rated one.
const SORTS: Record<string, (t: Tally) => number> = {
	picks: (t) => t.picks,
	players: (t) => t.players.size,
	mw: (t) => matchWinPct(t) ?? -1,
	gw: (t) => gameWinPct(t) ?? -1
};

export const load: PageServerLoad = ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	const list = seasonEntries(season.id);
	const names = new Map(list.map((e) => [e.playerId, e.displayName]));
	const dropped = new Set(list.filter((e) => e.dropped).map((e) => e.playerId));
	const ms = legendMatches(seasonMatches(season.id), dropped);
	const rows = legendStats(ms);
	const sort = url.searchParams.get('sort') ?? 'picks';
	if (sort === 'legend') rows.sort((a, b) => a.key.localeCompare(b.key));
	else if (SORTS[sort]) rows.sort((a, b) => SORTS[sort](b) - SORTS[sort](a) || b.picks - a.picks);
	const open = url.searchParams.get('legend');

	return {
		season,
		sort,
		open,
		matches: ms.length,
		rows,
		users: open
			? legendPlayers(ms, open).map((t) => ({ ...t, name: names.get(t.key) ?? 'Unknown' }))
			: [],
		notPicked: LEGENDS.filter((l) => !rows.some((r) => r.key === l))
	};
};
```

- [ ] **Step 2: `+page.svelte`**

```svelte
<script lang="ts">
	import { pct } from '#lib/format.ts';
	import { gameWinPct, matchWinPct } from '#lib/league/legendStats.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const season = $derived(data.season);
	const COLS = [
		['legend', 'Legend'],
		['picks', 'Picks'],
		['players', 'Players'],
		['', 'W–D–L'],
		['mw', 'Match win %'],
		['gw', 'Game win %']
	] as const;
	const href = (sort: string, legend: string | null) =>
		`?sort=${sort}${legend ? `&legend=${encodeURIComponent(legend)}` : ''}`;
</script>

<svelte:head>
	<title>Legends · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{season.name}</span>
	<h1>Legends</h1>
	<p class="muted">Win rates show once a legend has 5+ matches. Mirror matches count as picks, not wins.</p>

	{#if !data.rows.length}
		<div class="status">
			<strong>No results yet.</strong> Legend stats appear after the first reported match.
			<a href="/seasons/{season.slug}/schedule">See the schedule</a>
		</div>
	{:else}
		<div class="panel standings">
			<table class="pb-table">
				<thead>
					<tr>
						{#each COLS as [key, label] (label)}
							<th class={key !== 'legend' && 'pb-num'} aria-sort={key === data.sort ? (key === 'legend' ? 'ascending' : 'descending') : undefined}>
								{#if key}<a href={href(key, data.open)}>{label}</a>{:else}{label}{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.rows as r (r.key)}
						<tr>
							<th scope="row">
								<a href={href(data.sort, data.open === r.key ? null : r.key)} aria-expanded={data.open === r.key}>
									{r.key}
								</a>
							</th>
							<td class="pb-num">{r.picks}</td>
							<td class="pb-num">{r.players.size}</td>
							<td class="pb-num">{r.wins}–{r.draws}–{r.losses}</td>
							<td class="pb-num">{pct(matchWinPct(r))}</td>
							<td class="pb-num">{pct(gameWinPct(r))}</td>
						</tr>
						{#if data.open === r.key}
							<tr>
								<td colspan="6">
									<ul class="player-list" aria-label="Players who used {r.key}">
										{#each data.users as u (u.key)}
											<li>
												<a class="grow" href="/seasons/{season.slug}/players/{u.key}">{u.name}</a>
												<span class="pb-num muted">{u.picks} M</span>
												<span class="pb-num">{u.wins}–{u.draws}–{u.losses}</span>
												{#if u.mirrors}<span class="muted small">· {u.mirrors} mirror</span>{/if}
											</li>
										{/each}
									</ul>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
		<p class="muted small">
			{data.rows.reduce((s, r) => s + r.picks, 0)} picks from {data.matches} reported matches. Void
			matches and deadline double losses are left out. W–D–L leaves out mirror matches.
		</p>
	{/if}

	{#if data.notPicked.length}
		<details>
			<summary>Not picked yet · {data.notPicked.length}</summary>
			<p>{#each data.notPicked as l (l)}<span class="pb-badge">{l}</span> {/each}</p>
		</details>
	{/if}
</div>
```

- [ ] **Step 3: Verify** `npm run check` — 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/seasons/[slug]/legends
git commit -m "feat: season legends page"
```

---

### Task 9: Archive

**Files:**
- Create: `src/routes/seasons/+page.server.ts`, `src/routes/seasons/+page.svelte`

- [ ] **Step 1: `+page.server.ts`**

```ts
import { allSeasons, groupStandings, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

// ponytail: queries per season; fine for a handful of seasons a year.
export const load: PageServerLoad = () => ({
	seasons: allSeasons()
		.filter((s) => s.status !== 'draft')
		.map((s) => {
			const list = seasonEntries(s.id);
			const groups = s.status === 'finished' ? groupStandings(s, list) : [];
			return {
				...s,
				players: list.length,
				groups: new Set(list.map((e) => e.group).filter(Boolean)).size,
				winners: groups.map((g) => g.rows[0]?.name).filter(Boolean)
			};
		})
});
```

- [ ] **Step 2: `+page.svelte`**

```svelte
<script lang="ts">
	import { date } from '#lib/format.ts';
	import { STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Season archive · Poroleague</title>
</svelte:head>

<div class="page">
	<h1>Season archive</h1>
	{#if data.seasons.length}
		<ul class="archive">
			{#each data.seasons as s (s.id)}
				<li class="panel">
					<div class="grow">
						<h2><a href="/seasons/{s.slug}">{s.name}</a></h2>
						<span class="muted small">
							{date(s.startDate)} – {date(s.deadline)} · {s.players} players{s.groups
								? ` · ${s.groups} group${s.groups > 1 ? 's' : ''}`
								: ''}
						</span>
					</div>
					{#if s.winners.length}
						<div>
							<span class="eyebrow">Group winner{s.winners.length > 1 ? 's' : ''}</span>
							<strong class="winner">{s.winners.join(' · ')}</strong>
						</div>
					{/if}
					<span class={['pb-badge', s.status !== 'finished' && 'pb-badge-live']}>{STATUS_LABEL[s.status]}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="status">No seasons yet. The first one shows up here once signup opens.</p>
	{/if}
</div>

<style>
	.archive {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.archive li {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 32px;
		align-items: center;
	}
	.archive h2 {
		margin: 0 0 4px;
	}
	.archive h2 a {
		color: var(--ink);
		text-decoration: none;
	}
	.archive .grow {
		flex: 1 1 260px;
	}
	.archive .eyebrow {
		display: block;
	}
	.winner {
		color: var(--signal);
	}
</style>
```

- [ ] **Step 3: Verify** `npm run check` — 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/seasons/+page.server.ts src/routes/seasons/+page.svelte
git commit -m "feat: season archive"
```

---

### Task 10: Audit page

**Files:**
- Modify: `src/lib/server/matches.ts`
- Create: `src/routes/seasons/[slug]/audit/+page.server.ts`, `+page.svelte`

- [ ] **Step 1: `seasonAudit` in `matches.ts`**

```ts
export const seasonAudit = (seasonId: number) =>
	db
		.select({
			id: audit.id,
			action: audit.action,
			before: audit.before,
			after: audit.after,
			createdAt: audit.createdAt,
			actor: players.displayName,
			group: matches.group,
			round: matches.round,
			p1Id: matches.p1Id,
			p2Id: matches.p2Id
		})
		.from(audit)
		.innerJoin(players, eq(audit.actorId, players.id))
		.leftJoin(matches, eq(audit.matchId, matches.id))
		.where(eq(audit.seasonId, seasonId))
		.orderBy(desc(audit.id))
		.all();
```

- [ ] **Step 2: `+page.server.ts`** — turns each row into one line of text. Plan 6 adds actions (`edit`, `resolve`, `drop`); unknown actions fall back to their raw name, and any before/after result renders as "old → new".

```ts
import { when } from '#lib/format.ts';
import type { Report } from '#lib/league/report.ts';
import { groupName } from '#lib/season.ts';
import { seasonAudit } from '#lib/server/matches.ts';
import { publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

type Change = Partial<Report> & { flagReason?: string };
const LABEL: Record<string, string> = { report: 'Report', flag: 'Flag', edit: 'Edit', resolve: 'Resolve', drop: 'Drop' };

export const load: PageServerLoad = ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	const names = new Map(seasonEntries(season.id).map((e) => [e.playerId, e.displayName]));
	const name = (id: string | null | undefined) => (id && names.get(id)) || 'Unknown';
	const type = url.searchParams.get('type');
	const rows = seasonAudit(season.id);

	const lines = rows
		.filter((r) => !type || r.action === type)
		.map((r) => {
			const result = (c: Change | null) =>
				c?.p1Games != null
					? `${name(r.p1Id)} ${c.p1Games}–${c.p2Games} ${name(r.p2Id)} · ${c.p1Legend} vs ${c.p2Legend} · dice: ${name(c.diceWinnerId)}`
					: '';
			const [before, after] = [r.before as Change | null, r.after as Change | null];
			const change = [result(before), result(after)].filter(Boolean).join(' → ');
			const where = r.round ? `${r.group ? `${groupName(r.group)} ` : ''}R${r.round}` : '';
			// A result line already names both players; otherwise (flag, drop) say whose match it was.
			const match = where && !change ? `${where} · ${name(r.p1Id)} vs ${name(r.p2Id)}` : where;
			return {
				id: r.id,
				when: when(r.createdAt),
				actor: r.actor,
				action: r.action,
				label: LABEL[r.action] ?? r.action,
				what: [match, change, after?.flagReason ? `“${after.flagReason}”` : '']
					.filter(Boolean)
					.join(' · ')
			};
		});

	return {
		season,
		type,
		lines,
		actions: [...new Set(rows.map((r) => r.action))].map((a) => ({ a, label: LABEL[a] ?? a }))
	};
};
```

- [ ] **Step 3: `+page.svelte`**

```svelte
<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const season = $derived(data.season);
	const TONE: Record<string, string> = { flag: 'pb-badge-rank', edit: 'pb-badge-win', resolve: 'pb-badge-win', drop: 'pb-badge-live' };
</script>

<svelte:head>
	<title>Audit log · {season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{season.name}</span>
	<h1>Audit log</h1>
	<p class="muted">Every report, flag and organizer change this season, newest first.</p>

	{#if data.actions.length > 1}
		<div class="seg" role="group" aria-label="Filter by type">
			<a href="?" aria-current={!data.type ? 'true' : undefined}>All</a>
			{#each data.actions as { a, label } (a)}
				<a href="?type={a}" aria-current={data.type === a ? 'true' : undefined}>{label}</a>
			{/each}
		</div>
	{/if}

	{#if data.lines.length}
		<div class="panel standings">
			<table class="pb-table">
				<thead><tr><th>When</th><th>Who</th><th>Type</th><th>What</th></tr></thead>
				<tbody>
					{#each data.lines as l (l.id)}
						<tr>
							<td class="pb-num nowrap">{l.when}</td>
							<td>{l.actor}</td>
							<td><span class={['pb-badge', TONE[l.action]]}>{l.label}</span></td>
							<td>{l.what}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="status">Nothing logged yet.</p>
	{/if}
</div>

<style>
	.nowrap {
		white-space: nowrap;
		text-align: left !important;
	}
</style>
```

`.standings { overflow-x: auto; }` lives in the season page's scoped style; move it to `src/app.css` in this task so the legends and audit tables scroll on phones too.

- [ ] **Step 4: Verify** `npm run check` — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/matches.ts src/routes/seasons/[slug]/audit src/app.css src/routes/seasons/[slug]/+page.svelte
git commit -m "feat: public audit log"
```

---

### Task 11: Verify end to end

- [ ] **Step 1:** `npx vitest run` — all pass. `npm run check` — 0 errors. `npm run lint` — clean (run `npm run format` first if needed, commit as `style: format`).
- [ ] **Step 2: Smoke test in a worktree** (never a second dev server in the main checkout; see `no-second-dev-server` memory): `git worktree add <scratchpad>/wt HEAD`, `npm ci`, copy `.env` with `DATABASE_URL` pointed at a scratch DB, `npm run db:migrate`, create a season and lock its groups (admin UI, or seed + lock through the admin pages), `npm run db:seed-dev -- <slug>`, `npm run db:play-dev -- <slug> 0.6 --drop`, start `npx vite dev --port 5174`, then `curl` each page and check status 200 plus a key string:
  - `/seasons` → "Season archive"
  - `/seasons/<slug>` → "Group A" and "Pts"
  - `/seasons/<slug>/schedule` and `?week=2&mine=1` → "Week 1"
  - `/seasons/<slug>/players/<id>` → "Matches this season"
  - `/seasons/<slug>/legends` and `?sort=mw&legend=Jinx` → "Picks"
  - `/seasons/<slug>/audit` → "Audit log"
  - `/seasons/<slug>/players/nope` → 404
- [ ] **Step 3:** Stop the worktree server, `git worktree remove`. Tick the issue checklist, ask before push/PR.
