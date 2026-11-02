# Achievements Implementation Plan (#142)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players earn stored, never-revoked achievements from their public match history, shown on the career page (`/players/[id]`) with unlock dates and progress. The definitions are the base for profile cosmetics (#143).

**Architecture:** Definitions and the pure checks live in `src/lib/league/achievements.ts`. Each definition has a `need` and a "hits" function that returns the dated events counting towards it (one per match with Ahri, one per dice roll won, and so on). An achievement unlocks at hit number `need`, and that hit's date and season are stored. One server entry point, `awardAchievements(db, playerIds)` in `src/lib/server/achievements.ts`, rebuilds a player's history, evaluates every definition and inserts any missing row (`onConflictDoNothing`). It never deletes. Every result write path calls it after its transaction. A SvelteKit `init` hook backfills on every server start, which covers every deploy. The server module takes `db` as a parameter so the node dev scripts (`reseed-dev`, `play-dev`, `report-dev`, `backfill-achievements`) can import the same code without `$app/env`.

**Builds on #141 (merged first):** `isPublished` in `src/lib/league/publish.ts` is the only visibility check here, with no parallel filter. League imports are already `#lib/….ts`. porobound.css already has the `--tier-*` tokens. #141's migration is 0007, so this one is **0008**.

**Tech Stack:** SvelteKit (adapter-node), TypeScript, Drizzle + better-sqlite3, Vitest, Playwright. No new dependencies.

**Branch:** `feat/142-achievements` (scratchpad worktree, per the worktree workflow). PR title `feat(achievements): achievements on the career page`, body `Closes #142`.

---

## Decisions this plan locks in (from the issue and the brief)

- **Counted match** = all of these: the player is in it; it's in a live season the player entered (not soft-deleted, not draft); it's visible (`isPublished`: playoff, or group round ≤ `season.publishedRound`); it has `reportedAt`, `p1Games` and `p2Games`; it has no `walkoverId`; and it isn't void (neither player dropped in that season). Deadline double losses have no score, so they drop out. Flagged but unresolved results count, because they're public.
- **Visibility has one call site:** #141's `isPublished(m, publishedRound)` (`src/lib/league/publish.ts`), called only from `played()` in `src/lib/league/achievements.ts`. `playerHistory` doesn't use the `publishedMatch()` SQL helper: Perfect Group needs every scheduled group match, played or not, so the filter runs in the pure layer, where the unit tests cover it.
- **unlockedAt:** for match-driven achievements, the `reportedAt` of the hit match. For season-driven ones it's the date of the season event's audit row: `finalize` for Perfect Group, `topcut` (bracket published) for Top Cut, `champion` (top cut finished) for Champion. A season with no such audit row gives no hit. Veteran uses the first counted match of the Nth season. `seasonId` is the hit's season.
- **Triggers:** `saveReport`, `organizerEdit`, `keepResult` award the two players. `publishWeek`, `finalizeSeason`, `cancelDrop`, `publishCut` and `finishCut` award every entry of the season. Walkovers change no counted result, so they don't award. `publishCut` and `cancelDrop` aren't in the issue's list but are needed (see the report).
- **Career display:** legend tracks only for legends with progress or an earned tier (otherwise there would be 58 empty tracks). League tracks are Variety and Dice rolls. Flat achievements go under "One-offs". The summary reads "N earned". The earned/locked state comes from the table (award-only). Locked progress is derived on load.

## Full achievement list (187)

Ids are stored in the DB and in #143's columns, so never rename one. `key(s)` = lowercase, apostrophes removed, non-alphanumerics → `-`, trimmed (`K'Sante` → `ksante`, `Jarvan IV` → `jarvan-iv`, `Master Yi (PG)` → `master-yi-pg`). `champion(l)` strips ` (PG)` / ` (XP)`.

| Id                                             | Track           | Tier   | Name (= title)    | Description                                            | need | Icon                                                    |
| ---------------------------------------------- | --------------- | ------ | ----------------- | ------------------------------------------------------ | ---- | ------------------------------------------------------- |
| `legend-<key>-player` (×58, one per `LEGENDS`) | `legend-<key>`  | bronze | `<Legend> Player` | Play 3 matches as `<Legend>`.                          | 3    | `/achievements/champions/<key(champion)>.png`           |
| `legend-<key>-expert`                          | `legend-<key>`  | silver | `<Legend> Expert` | Play 10 matches as `<Legend>`.                         | 10   | same                                                    |
| `legend-<key>-master`                          | `legend-<key>`  | gold   | `<Legend> Master` | Play 25 matches as `<Legend>`.                         | 25   | same                                                    |
| `variety-player`                               | `variety`       | bronze | Variety Player    | Play at least 2 matches each with 3 different legends. | 3    | `/achievements/tiers/bronze.png`                        |
| `variety-expert`                               | `variety`       | silver | Variety Expert    | … with 5 different legends.                            | 5    | `/achievements/tiers/silver.png`                        |
| `variety-master`                               | `variety`       | gold   | Variety Master    | … with 10 different legends.                           | 10   | `/achievements/tiers/gold.png`                          |
| `dice-player`                                  | `dice`          | bronze | Dice Player       | Win 3 dice rolls.                                      | 3    | `/achievements/tiers/bronze.png`                        |
| `dice-expert`                                  | `dice`          | silver | Dice Expert       | Win 6 dice rolls.                                      | 6    | `/achievements/tiers/silver.png`                        |
| `dice-master`                                  | `dice`          | gold   | Dice Master       | Win 20 dice rolls.                                     | 20   | `/achievements/tiers/gold.png`                          |
| `first-blood`                                  | `first-blood`   | —      | First Blood       | Win your first match.                                  | 1    | `/achievements/items/first-blood.png` (Ignite)          |
| `veteran-3`                                    | `veteran-3`     | —      | Veteran           | Play in 3 seasons.                                     | 3    | `/achievements/items/veteran-3.png` (Stealth Ward)      |
| `veteran-10`                                   | `veteran-10`    | —      | Old Guard         | Play in 10 seasons.                                    | 10   | `/achievements/items/veteran-10.png` (Guardian Angel)   |
| `perfect-group`                                | `perfect-group` | —      | Perfect Group     | Win every group match of a season.                     | 1    | `/achievements/items/perfect-group.png` (Infinity Edge) |
| `comeback`                                     | `comeback`      | —      | Comeback          | Win a match after losing game 1.                       | 1    | `/achievements/items/comeback.png` (Heal)               |
| `top-cut`                                      | `top-cut`       | —      | Top Cut           | Reach a top cut.                                       | 1    | `/achievements/items/top-cut.png` (Flash)               |
| `champion`                                     | `champion`      | —      | Champion          | Win a top-cut final.                                   | 1    | `/achievements/items/champion.png` (Rabadon's Deathcap) |

Master Yi (PG) and (XP) are separate tracks that share `master-yi.png`. Legend tiles show a tier crest (`/achievements/tiers/<tier>.svg`) over the champion square, with a tier-coloured ring.

## Icon sources (fetched once, committed)

- Data Dragon `16.21.1`: `https://ddragon.leagueoflegends.com/cdn/16.21.1/data/en_US/champion.json` (name → id), `…/img/champion/<id>.png` (120×120), `…/img/item/{3340,3026,3031,3089}.png`, `…/img/spell/{SummonerDot,SummonerHeal,SummonerFlash}.png`.
- CommunityDragon `16.21`: `https://raw.communitydragon.org/16.21/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-{bronze,silver,gold}.png` (1280×720, emblem centred) and `…/ranked-mini-crests/{bronze,silver,gold}.svg`.
- I checked all of them (HTTP 200) on 2026-11-02. All 58 `LEGENDS` map to Data Dragon names.

## File structure

| File                                                                                                                     | Responsibility                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/lib/league/publish.ts` (from #141, read only)                                                                       | `isPublished`                                                                                     |
| `src/lib/league/achievements.ts` (create)                                                                                | types, definitions, `played`, hits, `evaluate`, `key`, `champion`, `emblem`, `crest`              |
| `src/lib/league/achievements.spec.ts` (create)                                                                           | unit tests for the definitions, checks and icons on disk                                          |
| `src/lib/server/db/schema.ts` (modify)                                                                                   | `playerAchievements` table                                                                        |
| `drizzle/0008_*.sql`, `drizzle/meta/*` (generated)                                                                       | migration                                                                                         |
| `src/lib/server/test/setup.ts` (modify)                                                                                  | wipe the new table                                                                                |
| `src/lib/server/achievements.ts` (create)                                                                                | `playerHistory`, `awardAchievements`, `awardSeason`, `backfillAchievements`, `careerAchievements` |
| `src/lib/server/achievements.spec.ts` (create)                                                                           | award, award-only, visibility, backfill, call sites, career view                                  |
| `src/lib/server/matches.ts`, `seasons.ts`, `topCut.ts` (modify)                                                          | call the award after each result write                                                            |
| `src/lib/server/topCut.spec.ts` (modify)                                                                                 | Top Cut and Champion awards                                                                       |
| `src/hooks.server.ts` (modify)                                                                                           | `init` = backfill on start                                                                        |
| `scripts/backfill-achievements.ts` (create)                                                                              | manual backfill                                                                                   |
| `scripts/fetch-icons.ts` (create), `static/achievements/**` (create)                                                     | self-hosted icons                                                                                 |
| `src/lib/components/Achievements.svelte` (create)                                                                        | Achievements section                                                                              |
| `src/routes/players/[id]/+page.server.ts`, `+page.svelte` (modify)                                                       | load and render                                                                                   |
| `src/lib/server/pages.spec.ts` (modify)                                                                                  | career load includes achievements                                                                 |
| `e2e/achievements.spec.ts` (create), `e2e/fixtures.ts`, `e2e/db.ts`, `e2e/mobile.spec.ts` (modify)                       | e2e                                                                                               |
| `scripts/reseed-dev.ts`, `scripts/report-dev.ts`, `scripts/play-dev.ts` (modify), `scripts/achievements-dev.ts` (create) | dev data                                                                                          |
| `package.json`, `README.md`, `docs/spec.md`, `docs/ops.md` (modify)                                                      | scripts and docs                                                                                  |

---

### Task 1: Prerequisite check (#141 landed)

#141 provides everything this task used to add. Don't re-add any of it: `isPublished(m, publishedRound)` in `src/lib/league/publish.ts`, the `publishedMatch()` SQL helper in `schema.ts`, league imports migrated to `#lib/….ts` (node-loadable), porobound.css re-synced with the `--tier-*` tokens and #143's classes, and migration 0007.

- [ ] **Step 1: Rebase the branch on `main` once #141 is merged, then check**

```bash
grep -n "export const isPublished\|export function isPublished" src/lib/league/publish.ts
grep -n "publishedMatch" src/lib/server/db/schema.ts
grep -c "tier-bronze" src/lib/styles/porobound.css
ls drizzle/0007_*.sql
node -e "await import('#lib/league/standings.ts'); await import('#lib/league/publish.ts'); console.log('ok')"
```

Expected: each grep hits, the count is > 0, 0007 exists, and the node import prints `ok`.

- [ ] **Step 2: Read `isPublished`'s signature.** If it accepts `{ stage, round }` and passes playoff matches, call it as-is in Task 3. If it takes only `{ round }` (group-only), Task 3's `played()` calls it as `m.stage === 'playoff' || isPublished(m, s.publishedRound)`. Either way that is the single visibility call site, and there is no parallel filter. Note which one applies, then continue; there's nothing to commit.

---

### Task 2: Achievement definitions

**Files:**

- Create: `src/lib/league/achievements.ts`
- Test: `src/lib/league/achievements.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { LEGENDS } from '#lib/legends.ts';
import { ACHIEVEMENTS, achievementById, champion, key } from '#lib/league/achievements.ts';

describe('definitions', () => {
	it('has unique ids: three tiers per legend, Variety, Dice and seven one-offs', () => {
		expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
		expect(ACHIEVEMENTS).toHaveLength(LEGENDS.length * 3 + 6 + 7);
	});

	it('gives every legend a Player/Expert/Master track at 3/10/25', () => {
		for (const l of LEGENDS)
			expect(
				ACHIEVEMENTS.filter((a) => a.legend === l).map((a) => [a.id, a.tier, a.name, a.need])
			).toEqual([
				[`legend-${key(l)}-player`, 'bronze', `${l} Player`, 3],
				[`legend-${key(l)}-expert`, 'silver', `${l} Expert`, 10],
				[`legend-${key(l)}-master`, 'gold', `${l} Master`, 25]
			]);
	});

	it('keys legends for ids and icons', () => {
		expect(["K'Sante", 'Jarvan IV', 'Master Yi (PG)', 'Renata Glasc'].map(key)).toEqual([
			'ksante',
			'jarvan-iv',
			'master-yi-pg',
			'renata-glasc'
		]);
		expect(champion('Master Yi (XP)')).toBe('Master Yi');
		expect(achievementById.get('legend-master-yi-xp-gold')).toBeUndefined();
		expect(achievementById.get('legend-master-yi-xp-master')!.icon).toBe(
			'/achievements/champions/master-yi.png'
		);
	});

	it('lists the league tracks and one-offs', () => {
		const pick = (ids: string[]) =>
			ids.map((id) => {
				const a = achievementById.get(id)!;
				return [a.track, a.tier, a.name, a.need];
			});
		expect(pick(['variety-player', 'variety-expert', 'variety-master'])).toEqual([
			['variety', 'bronze', 'Variety Player', 3],
			['variety', 'silver', 'Variety Expert', 5],
			['variety', 'gold', 'Variety Master', 10]
		]);
		expect(pick(['dice-player', 'dice-expert', 'dice-master']).map((x) => x[3])).toEqual([
			3, 6, 20
		]);
		const flat = ACHIEVEMENTS.filter((a) => !a.tier).map((a) => [a.id, a.need]);
		expect(flat).toEqual([
			['first-blood', 1],
			['veteran-3', 3],
			['veteran-10', 10],
			['perfect-group', 1],
			['comeback', 1],
			['top-cut', 1],
			['champion', 1]
		]);
		for (const a of ACHIEVEMENTS) expect(a.title).toBe(a.name);
	});
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/league/achievements.spec.ts`
Expected: FAIL, cannot resolve `./achievements.ts`.

- [ ] **Step 3: Implement** `src/lib/league/achievements.ts` (Task 3 adds the hit bodies; here each `hits` returns `[]` so the file type-checks)

```ts
import { LEGENDS, type Legend } from '#lib/legends.ts';

export type Tier = 'bronze' | 'silver' | 'gold';

// One achievement, for the career page and for cosmetics (#143). Rows store `id`: never rename one.
export type Achievement = {
	id: string;
	track: string; // the tiers of one track read as a progression; a one-off is its own track
	tier: Tier | null; // LoL rank emblem: Player = Bronze, Expert = Silver, Master = Gold
	name: string;
	description: string;
	title: string; // shown with the player's name when equipped (#143)
	icon: string; // under static/
	legend: Legend | null; // legend tracks only
	need: number; // hits to unlock
};

export type Hit = { at: Date; seasonId: number };
// Filled in by Task 3.
type Hits = (ms: unknown[], h: unknown) => Hit[];
type Def = Achievement & { hits: Hits };

export const key = (s: string) =>
	s
		.toLowerCase()
		.replace(/'/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
export const champion = (legend: string) => legend.replace(/ \((PG|XP)\)$/, '');
export const emblem = (t: Tier) => `/achievements/tiers/${t}.png`;
export const crest = (t: Tier) => `/achievements/tiers/${t}.svg`;

const LEVELS = [
	['bronze', 'Player'],
	['silver', 'Expert'],
	['gold', 'Master']
] as const;

function tiered(
	track: string,
	label: string,
	describe: (n: number) => string,
	needs: [number, number, number],
	hits: Hits,
	icon: (t: Tier) => string,
	legend: Legend | null = null
): Def[] {
	return LEVELS.map(([tier, level], i) => ({
		id: `${track}-${level.toLowerCase()}`,
		track,
		tier,
		name: `${label} ${level}`,
		description: describe(needs[i]),
		title: `${label} ${level}`,
		icon: icon(tier),
		legend,
		need: needs[i],
		hits
	}));
}

const flat = (id: string, name: string, description: string, hits: Hits, need = 1): Def => ({
	id,
	track: id,
	tier: null,
	name,
	description,
	title: name,
	icon: `/achievements/items/${id}.png`,
	legend: null,
	need,
	hits
});

const none: Hits = () => [];

const DEFS: Def[] = [
	...LEGENDS.flatMap((l) =>
		tiered(
			`legend-${key(l)}`,
			l,
			(n) => `Play ${n} matches as ${l}.`,
			[3, 10, 25],
			none,
			() => `/achievements/champions/${key(champion(l))}.png`,
			l
		)
	),
	...tiered(
		'variety',
		'Variety',
		(n) => `Play at least 2 matches each with ${n} different legends.`,
		[3, 5, 10],
		none,
		emblem
	),
	...tiered('dice', 'Dice', (n) => `Win ${n} dice rolls.`, [3, 6, 20], none, emblem),
	flat('first-blood', 'First Blood', 'Win your first match.', none),
	flat('veteran-3', 'Veteran', 'Play in 3 seasons.', none, 3),
	flat('veteran-10', 'Old Guard', 'Play in 10 seasons.', none, 10),
	flat('perfect-group', 'Perfect Group', 'Win every group match of a season.', none),
	flat('comeback', 'Comeback', 'Win a match after losing game 1.', none),
	flat('top-cut', 'Top Cut', 'Reach a top cut.', none),
	flat('champion', 'Champion', 'Win a top-cut final.', none)
];

export const ACHIEVEMENTS: readonly Achievement[] = DEFS;
export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/league/achievements.spec.ts && npm run check`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/league/achievements.ts src/lib/league/achievements.spec.ts
git commit -m "feat(achievements): achievement definitions"
```

---

### Task 3: Pure checks over a player's history

**Files:**

- Modify: `src/lib/league/achievements.ts`
- Test: `src/lib/league/achievements.spec.ts`

- [ ] **Step 1: Write the failing tests** (append; add `evaluate`, `type History`, `type HistoryMatch`, `type HistorySeason` to the import, and `beforeEach` to the vitest import)

```ts
const D = (day: number) => new Date(Date.UTC(2026, 0, day));
let day = 0;
beforeEach(() => (day = 0));
const S = (o: Partial<HistorySeason> = {}): HistorySeason => ({
	id: 1,
	publishedRound: 99,
	dropped: new Set(),
	finalizedAt: null,
	cutAt: null,
	championAt: null,
	...o
});
// Me as p1, a 2–0 win as Ahri, my dice roll, reported the next day.
const M = (o: Partial<HistoryMatch> = {}): HistoryMatch => ({
	seasonId: 1,
	stage: 'group',
	round: 1,
	p1Id: 'me',
	p2Id: 'op',
	p1Games: 2,
	p2Games: 0,
	games: null,
	p1Legend: 'Ahri',
	p2Legend: 'Annie',
	diceWinnerId: 'me',
	reportedAt: D(++day),
	walkoverId: null,
	...o
});
const H = (matches: HistoryMatch[], seasons = [S()]): History => ({
	playerId: 'me',
	matches,
	seasons
});
const get = (h: History, id: string) => evaluate(h).find((p) => p.id === id)!;
const n = (k: number, o: Partial<HistoryMatch> = {}) => Array.from({ length: k }, () => M(o));

describe('legend tracks', () => {
	it('unlock on the match that reaches the threshold, from either side', () => {
		expect(get(H(n(2)), 'legend-ahri-player')).toMatchObject({ have: 2, need: 3, hit: null });
		const h = H(
			[...n(2), M({ p1Id: 'op', p2Id: 'me', p1Legend: 'Annie', p2Legend: 'Ahri', seasonId: 2 })],
			[S(), S({ id: 2 })]
		);
		expect(get(h, 'legend-ahri-player')).toMatchObject({ have: 3, hit: { at: D(3), seasonId: 2 } });
		expect(get(h, 'legend-ahri-expert')).toMatchObject({ have: 3, need: 10, hit: null });
	});

	it('count losses and mirrors: matches, not wins', () => {
		const h = H([
			M({ p1Games: 0, p2Games: 2 }),
			M({ p2Legend: 'Ahri' }),
			M({ p1Games: 1, p2Games: 1 })
		]);
		expect(get(h, 'legend-ahri-player').hit).toEqual({ at: D(3), seasonId: 1 });
	});
});

describe('what counts', () => {
	it('leaves out void, unplayed (double loss), hidden, walkover and other seasons', () => {
		const h = H(
			[
				M({ p2Id: 'gone' }), // void: opponent dropped
				M({ p1Games: null, p2Games: null, reportedAt: null }), // unplayed / double loss
				M({ round: 5 }), // round not published
				M({ walkoverId: 'me' }),
				M({ seasonId: 9 }), // deleted or draft season: not in `seasons`
				M({ p1Id: 'x', p2Id: 'y' }) // not my match
			],
			[S({ publishedRound: 4, dropped: new Set(['gone']) })]
		);
		expect(evaluate(h).every((p) => p.have === 0)).toBe(true);
	});

	it('counts playoff matches whatever the published round', () => {
		expect(
			get(H([M({ stage: 'playoff', round: 5 })], [S({ publishedRound: 0 })]), 'first-blood').have
		).toBe(1);
	});
});

describe('league tracks', () => {
	it('Variety: the match that gives the Nth legend its second match', () => {
		const h = H([
			...n(2, { p1Legend: 'Ahri' }),
			M({ p1Legend: 'Jinx' }),
			M({ p1Legend: 'Viktor' }),
			M({ p1Legend: 'Jinx' }),
			M({ p1Legend: 'Viktor' })
		]);
		expect(get(h, 'variety-player')).toMatchObject({ have: 3, hit: { at: D(6) } });
		expect(get(H(n(5, { p1Legend: 'Ahri' })), 'variety-player').have).toBe(1);
	});

	it('Dice: rolls won', () => {
		const h = H([...n(2), M({ diceWinnerId: 'op' }), M()]);
		expect(get(h, 'dice-player')).toMatchObject({ have: 3, hit: { at: D(4) } });
	});
});

describe('one-offs', () => {
	it('First Blood: the first win, not a draw or loss', () => {
		const h = H([M({ p1Games: 1, p2Games: 1 }), M({ p1Games: 0, p2Games: 2 }), M()]);
		expect(get(h, 'first-blood').hit).toEqual({ at: D(3), seasonId: 1 });
	});

	it('Veteran: the first counted match of the 3rd season', () => {
		const seasons = [1, 2, 3, 4].map((id) => S({ id }));
		const h = H(
			[
				M({ seasonId: 1 }),
				M({ seasonId: 2 }),
				M({ seasonId: 2 }),
				M({ seasonId: 4, p2Id: 'gone' }),
				M({ seasonId: 3 })
			],
			[...seasons.slice(0, 3), S({ id: 4, dropped: new Set(['gone']) })]
		);
		expect(get(h, 'veteran-3')).toMatchObject({ have: 3, hit: { at: D(5), seasonId: 3 } });
		expect(get(h, 'veteran-10')).toMatchObject({ have: 3, need: 10, hit: null });
	});

	it('Perfect Group: every non-void group match won, dated by the finalize', () => {
		const fin = S({ finalizedAt: D(30), dropped: new Set(['gone']) });
		const won = [M(), M(), M({ p2Id: 'gone', p1Games: 0, p2Games: 2 })];
		expect(get(H(won, [fin]), 'perfect-group').hit).toEqual({ at: D(30), seasonId: 1 });
		expect(get(H(won, [S()]), 'perfect-group').hit).toBeNull(); // not finalized
		expect(get(H([M(), M({ p1Games: 1, p2Games: 1 })], [fin]), 'perfect-group').hit).toBeNull();
		expect(
			get(H([M(), M({ p1Games: null, p2Games: null, reportedAt: null })], [fin]), 'perfect-group')
				.hit
		).toBeNull();
	});

	it('Comeback: won after losing game 1, only with per-game results', () => {
		expect(get(H([M({ games: '211', p1Games: 2, p2Games: 1 })]), 'comeback').have).toBe(1);
		expect(
			get(
				H([M({ p1Id: 'op', p2Id: 'me', games: '122', p1Games: 1, p2Games: 2, p2Legend: 'Ahri' })]),
				'comeback'
			).have
		).toBe(1);
		expect(get(H([M({ games: '121', p1Games: 2, p2Games: 1 })]), 'comeback').have).toBe(0);
		expect(get(H([M({ games: null, p1Games: 2, p2Games: 1 })]), 'comeback').have).toBe(0);
		expect(get(H([M({ games: 'D11' })]), 'comeback').have).toBe(0);
	});

	it('Top Cut and Champion: dated by the season event', () => {
		const h = H([], [S({ cutAt: D(40) }), S({ id: 2, cutAt: D(20), championAt: D(25) })]);
		expect(get(h, 'top-cut').hit).toEqual({ at: D(20), seasonId: 2 });
		expect(get(h, 'champion').hit).toEqual({ at: D(25), seasonId: 2 });
	});
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/league/achievements.spec.ts`
Expected: FAIL, `evaluate` is not exported.

- [ ] **Step 3: Implement.** Add to `achievements.ts` the imports `import { isPublished } from '#lib/league/publish.ts';` and `import { isVoid } from '#lib/league/status.ts';` (the `#lib/….ts` style #141 migrates the league to). Replace the placeholder `Hits` type and the `none` uses with:

```ts
// A player's matches in the live seasons they entered (played or not), and those seasons.
export type HistoryMatch = {
	seasonId: number;
	stage: 'group' | 'playoff';
	round: number;
	p1Id: string;
	p2Id: string;
	p1Games: number | null;
	p2Games: number | null;
	games: string | null;
	p1Legend: string | null;
	p2Legend: string | null;
	diceWinnerId: string | null;
	reportedAt: Date | null;
	walkoverId: string | null;
};
export type HistorySeason = {
	id: number;
	publishedRound: number;
	dropped: Set<string>;
	finalizedAt: Date | null; // group stage finalized (audit `finalize`)
	cutAt: Date | null; // the player is in the published bracket (audit `topcut`)
	championAt: Date | null; // the player won the final (audit `champion`)
};
export type History = { playerId: string; matches: HistoryMatch[]; seasons: HistorySeason[] };

// One counted match from the player's side. `games` per game: '1' = they won it, '2' = lost, 'D'.
type Played = {
	seasonId: number;
	stage: 'group' | 'playoff';
	at: Date;
	legend: string | null;
	won: number;
	lost: number;
	games: string | null;
	dice: boolean;
};
type Hits = (ms: Played[], h: History) => Hit[];

const mine = (m: HistoryMatch, playerId: string) => m.p1Id === playerId || m.p2Id === playerId;
const flip = (games: string) => games.replace(/[12]/g, (g) => (g === '1' ? '2' : '1'));

// Counted matches, oldest first: public (isPublished), reported with a score, no walkover, not
// void. Deadline double losses have no score, so they're out.
export function played(h: History): Played[] {
	const seasons = new Map(h.seasons.map((s) => [s.id, s]));
	return h.matches
		.filter((m) => {
			const s = seasons.get(m.seasonId);
			return (
				!!s &&
				mine(m, h.playerId) &&
				isPublished(m, s.publishedRound) && // #141; see Task 1 Step 2 if it's group-only
				!!m.reportedAt &&
				m.p1Games !== null &&
				m.p2Games !== null &&
				!m.walkoverId &&
				!isVoid(m, s.dropped)
			);
		})
		.map((m) => {
			const me = m.p1Id === h.playerId;
			return {
				seasonId: m.seasonId,
				stage: m.stage,
				at: m.reportedAt!,
				legend: me ? m.p1Legend : m.p2Legend,
				won: me ? m.p1Games! : m.p2Games!,
				lost: me ? m.p2Games! : m.p1Games!,
				games: m.games && (me ? m.games : flip(m.games)),
				dice: m.diceWinnerId === h.playerId
			};
		})
		.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const hit = (x: { at: Date; seasonId: number }): Hit => ({ at: x.at, seasonId: x.seasonId });
const where =
	(f: (m: Played) => boolean): Hits =>
	(ms) =>
		ms.filter(f).map(hit);
const won = (m: Played) => m.won > m.lost;

const variety: Hits = (ms) => {
	const count = new Map<string, number>();
	return ms.flatMap((m) => {
		if (!m.legend) return [];
		const c = (count.get(m.legend) ?? 0) + 1;
		count.set(m.legend, c);
		return c === 2 ? [hit(m)] : [];
	});
};

const seasonsPlayed: Hits = (ms) => {
	const seen = new Set<number>();
	return ms.filter((m) => !seen.has(m.seasonId) && !!seen.add(m.seasonId)).map(hit);
};

const perfect: Hits = (ms, h) =>
	h.seasons.flatMap((s) => {
		if (!s.finalizedAt) return [];
		const scheduled = h.matches.filter(
			(m) =>
				m.seasonId === s.id && m.stage === 'group' && mine(m, h.playerId) && !isVoid(m, s.dropped)
		).length;
		const wins = ms.filter((m) => m.seasonId === s.id && m.stage === 'group' && won(m)).length;
		return scheduled && wins === scheduled ? [{ at: s.finalizedAt, seasonId: s.id }] : [];
	});

const seasonEvent =
	(k: 'cutAt' | 'championAt'): Hits =>
	(_, h) =>
		h.seasons
			.flatMap((s) => (s[k] ? [{ at: s[k], seasonId: s.id }] : []))
			.sort((a, b) => a.at.getTime() - b.at.getTime());
```

In `DEFS`, swap each `none` for its real hits: legend tracks `where((m) => m.legend === l)` (built once per legend, so the three tiers share it); Variety `variety`; Dice `where((m) => m.dice)`; first-blood `where(won)`; veteran-3/10 `seasonsPlayed`; perfect-group `perfect`; comeback `where((m) => m.games?.[0] === '2' && won(m))`; top-cut `seasonEvent('cutAt')`; champion `seasonEvent('championAt')`. Delete `none`. Then append:

```ts
export type Progress = { id: string; have: number; need: number; hit: Hit | null };

// Every achievement against one history: hits so far (capped at need) and the hit that unlocks it.
export function evaluate(h: History): Progress[] {
	const ms = played(h);
	const memo = new Map<Hits, Hit[]>();
	return DEFS.map((d) => {
		let hits = memo.get(d.hits);
		if (!hits) memo.set(d.hits, (hits = d.hits(ms, h)));
		return {
			id: d.id,
			have: Math.min(hits.length, d.need),
			need: d.need,
			hit: hits[d.need - 1] ?? null
		};
	});
}
```

- [ ] **Step 4: Run the tests and confirm they pass, then the node smoke test**

Run: `npx vitest run src/lib/league && npm run check && node -e "const a = await import('#lib/league/achievements.ts'); console.log(a.ACHIEVEMENTS.length)"`
Expected: PASS, 0 errors, `187`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/league/achievements.ts src/lib/league/achievements.spec.ts
git commit -m "feat(achievements): pure checks over a player's match history"
```

---

### Task 4: `player_achievements` table

**Files:**

- Modify: `src/lib/server/db/schema.ts`, `src/lib/server/test/setup.ts`
- Generated: `drizzle/0008_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0008_snapshot.json`

- [ ] **Step 1: Add the table** (end of `schema.ts`)

```ts
// Earned once, kept forever: later edits, flags, drops and voids never remove a row. Ids are
// definitions in src/lib/league/achievements.ts.
export const playerAchievements = sqliteTable(
	'player_achievements',
	{
		playerId: text('player_id')
			.notNull()
			.references(() => players.id),
		achievementId: text('achievement_id').notNull(),
		unlockedAt: integer('unlocked_at', { mode: 'timestamp' }).notNull(), // the triggering result or season event
		seasonId: integer('season_id').references(() => seasons.id)
	},
	(t) => [primaryKey({ columns: [t.playerId, t.achievementId] })]
);
```

- [ ] **Step 2: Wipe it in tests.** In `setup.ts`, import `playerAchievements` and put it first in the wipe list (foreign keys): `for (const t of [playerAchievements, audit, sessions, matches, entries, seasons, players])`.

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: one new `drizzle/0008_*.sql` (after #141's 0007) with `CREATE TABLE \`player_achievements\`` and a composite primary key.

- [ ] **Step 4: Run every test and confirm it passes** (setup runs the migration)

Run: `npx vitest run && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/test/setup.ts drizzle
git commit -m "feat(achievements): player_achievements table"
```

---

### Task 5: Award entry point, history and backfill

**Files:**

- Create: `src/lib/server/achievements.ts`
- Test: `src/lib/server/achievements.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, playerAchievements, seasons } from '#lib/server/db/schema.ts';
import { awardAchievements, backfillAchievements } from '#lib/server/achievements.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

const D = (day: number) => new Date(Date.UTC(2026, 0, day));
const rows = (playerId: string) =>
	db.select().from(playerAchievements).where(eq(playerAchievements.playerId, playerId)).all();
const row = (playerId: string, id: string) => rows(playerId).find((r) => r.achievementId === id);
// p1 beats p2 2–0 as Ahri, reported on `day`.
const win = (seasonId: number, round: number, day: number) =>
	seedMatch({
		seasonId,
		group: 1,
		round,
		p1Id: 'p1',
		p2Id: 'p2',
		p1Games: 2,
		p2Games: 0,
		p1Legend: 'Ahri',
		p2Legend: 'Annie',
		diceWinnerId: 'p1',
		reportedBy: 'p1',
		reportedAt: D(day)
	});
const season = (slug: string, values = {}) => {
	const s = seedSeason({ slug, status: 'play', publishedRound: 9, ...values });
	seedEntries(s.id, ['p1', 'p2'], 1);
	return s;
};

describe('awardAchievements', () => {
	it('dates each achievement by the historic result that earned it', () => {
		seedPlayers(2);
		const [a, b] = [season('a'), season('b')];
		win(a.id, 1, 1);
		win(a.id, 2, 5);
		win(b.id, 1, 9);
		awardAchievements(db, ['p1', 'p2']);
		expect(row('p1', 'first-blood')).toMatchObject({ unlockedAt: D(1), seasonId: a.id });
		expect(row('p1', 'legend-ahri-player')).toMatchObject({ unlockedAt: D(9), seasonId: b.id });
		expect(row('p1', 'dice-player')).toMatchObject({ unlockedAt: D(9) });
		expect(rows('p2').map((r) => r.achievementId)).toEqual(['legend-annie-player']);
	});

	it('is idempotent and never rewrites or removes a row', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 3);
		db.insert(playerAchievements)
			.values({ playerId: 'p1', achievementId: 'first-blood', unlockedAt: D(1), seasonId: null })
			.run();
		db.insert(playerAchievements)
			.values({ playerId: 'p1', achievementId: 'champion', unlockedAt: D(2), seasonId: null })
			.run();
		awardAchievements(db, ['p1']);
		awardAchievements(db, ['p1']);
		expect(row('p1', 'first-blood')!.unlockedAt).toEqual(D(1));
		expect(row('p1', 'champion')).toBeDefined();
		expect(rows('p1')).toHaveLength(2);
	});

	it('skips hidden rounds, drops and deleted seasons', () => {
		seedPlayers(2);
		const hidden = season('h', { publishedRound: 1 });
		win(hidden.id, 2, 1);
		const deleted = season('d', { deletedAt: D(4) });
		win(deleted.id, 1, 2);
		const voided = season('v');
		win(voided.id, 1, 3);
		db.update(entries).set({ dropped: true }).where(eq(entries.seasonId, voided.id)).run();
		awardAchievements(db, ['p1']);
		expect(rows('p1')).toEqual([]);
	});

	it('reads season events from the audit log', () => {
		seedPlayers(2);
		const s = season('a', { status: 'finished' });
		win(s.id, 1, 1);
		db.update(entries).set({ slot: 0, seed: 1 }).where(eq(entries.playerId, 'p1')).run();
		db.insert(audit)
			.values([
				{ seasonId: s.id, actorId: 'p1', action: 'finalize', createdAt: D(10) },
				{ seasonId: s.id, actorId: 'p1', action: 'topcut', createdAt: D(11) },
				{
					seasonId: s.id,
					actorId: 'p1',
					action: 'champion',
					after: { champion: 'p1' },
					createdAt: D(12)
				}
			])
			.run();
		awardAchievements(db, ['p1', 'p2']);
		expect(row('p1', 'perfect-group')!.unlockedAt).toEqual(D(10));
		expect(row('p1', 'top-cut')!.unlockedAt).toEqual(D(11));
		expect(row('p1', 'champion')!.unlockedAt).toEqual(D(12));
		expect(row('p2', 'top-cut')).toBeUndefined();
	});
});

describe('backfillAchievements', () => {
	it('awards every player', () => {
		seedPlayers(2);
		win(season('a').id, 1, 1);
		backfillAchievements(db);
		expect(row('p1', 'first-blood')).toBeDefined();
	});
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/server/achievements.spec.ts`
Expected: FAIL, cannot resolve `#lib/server/achievements.ts`.

- [ ] **Step 3: Implement** `src/lib/server/achievements.ts`

```ts
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { evaluate, type History } from '#lib/league/achievements.ts';
import * as schema from '#lib/server/db/schema.ts';

const { audit, entries, matches, playerAchievements, players, seasons } = schema;

// Takes the db instead of importing it, so the node dev scripts (no $app/env) can run it too.
export type Db = BetterSQLite3Database<typeof schema>;

export function playerHistory(db: Db, playerId: string): History {
	const mine = db
		.select({ id: seasons.id, publishedRound: seasons.publishedRound, slot: entries.slot })
		.from(entries)
		.innerJoin(seasons, eq(entries.seasonId, seasons.id))
		.where(
			and(eq(entries.playerId, playerId), isNull(seasons.deletedAt), ne(seasons.status, 'draft'))
		)
		.all();
	const ids = mine.map((s) => s.id);
	if (!ids.length) return { playerId, matches: [], seasons: [] };
	const dropped = db
		.select({ seasonId: entries.seasonId, playerId: entries.playerId })
		.from(entries)
		.where(and(inArray(entries.seasonId, ids), eq(entries.dropped, true)))
		.all();
	const events = db
		.select({
			seasonId: audit.seasonId,
			action: audit.action,
			after: audit.after,
			at: audit.createdAt
		})
		.from(audit)
		.where(
			and(inArray(audit.seasonId, ids), inArray(audit.action, ['finalize', 'topcut', 'champion']))
		)
		.all();
	const at = (seasonId: number, action: string, ok = (_after: unknown) => true) =>
		events.find((e) => e.seasonId === seasonId && e.action === action && ok(e.after))?.at ?? null;
	return {
		playerId,
		matches: db
			.select()
			.from(matches)
			.where(
				and(
					inArray(matches.seasonId, ids),
					or(eq(matches.p1Id, playerId), eq(matches.p2Id, playerId))
				)
			)
			.all(),
		seasons: mine.map((s) => ({
			id: s.id,
			publishedRound: s.publishedRound,
			dropped: new Set(dropped.filter((d) => d.seasonId === s.id).map((d) => d.playerId)),
			finalizedAt: at(s.id, 'finalize'),
			cutAt: s.slot === null ? null : at(s.id, 'topcut'),
			championAt: at(
				s.id,
				'champion',
				(a) => (a as { champion?: string } | null)?.champion === playerId
			)
		}))
	};
}

// The one award entry point: inserts what each player has newly earned and never removes
// anything (award-only), so it's safe after any write and on every start. One insert per
// player keeps it under SQLite's variable limit.
// ponytail: rebuilds each player's history; fine at league size.
export function awardAchievements(db: Db, playerIds: string[]) {
	db.transaction((tx) => {
		for (const playerId of new Set(playerIds)) {
			const rows = evaluate(playerHistory(tx, playerId)).flatMap((p) =>
				p.hit
					? [{ playerId, achievementId: p.id, unlockedAt: p.hit.at, seasonId: p.hit.seasonId }]
					: []
			);
			if (rows.length) tx.insert(playerAchievements).values(rows).onConflictDoNothing().run();
		}
	});
}

export const awardSeason = (db: Db, seasonId: number) =>
	awardAchievements(
		db,
		db
			.select({ id: entries.playerId })
			.from(entries)
			.where(eq(entries.seasonId, seasonId))
			.all()
			.map((e) => e.id)
	);

export const backfillAchievements = (db: Db) =>
	awardAchievements(
		db,
		db
			.select({ id: players.id })
			.from(players)
			.all()
			.map((p) => p.id)
	);
```

If `tx` isn't assignable to `Db` in `playerHistory(tx, …)`, widen the parameter type: `type Db = BetterSQLite3Database<typeof schema> | Parameters<Parameters<BetterSQLite3Database<typeof schema>['transaction']>[0]>[0]`. Only `select`/`insert`/`transaction` are used, so if `npm run check` objects to `transaction` on the union, keep the outer function on `BetterSQLite3Database` and type `playerHistory`'s parameter as the union.

- [ ] **Step 4: Run the tests and confirm they pass, then the node import**

Run: `npx vitest run src/lib/server/achievements.spec.ts && npm run check && node -e "await import('#lib/server/achievements.ts'); console.log('ok')"`
Expected: PASS, 0 errors, `ok` (proves no `$app/env` in the import chain).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/achievements.ts src/lib/server/achievements.spec.ts
git commit -m "feat(achievements): award entry point, history and backfill"
```

---

### Task 6: Award after every result write

**Files:**

- Modify: `src/lib/server/matches.ts` (`saveReport`, `organizerEdit`, `keepResult`), `src/lib/server/seasons.ts` (`publishWeek`, `finalizeSeason`, `cancelDrop`), `src/lib/server/topCut.ts` (`publishCut`, `finishCut`)
- Test: `src/lib/server/achievements.spec.ts`, `src/lib/server/topCut.spec.ts`

- [ ] **Step 1: Write the failing tests.** Append to `achievements.spec.ts` (extend its imports with `flagMatch, keepResult, organizerEdit, saveReport` from `#lib/server/matches.ts`, `cancelDrop, dropPlayer, finalizeSeason, publishWeek` from `#lib/server/seasons.ts`, and `type Report` from `#lib/league/report.ts`):

```ts
const result = (p1Games: number, p2Games: number): Report => ({
	games: null,
	p1Games,
	p2Games,
	p1Legend: 'Ahri',
	p2Legend: 'Annie',
	diceWinnerId: 'p1'
});
const open = (seasonId: number, round = 1) =>
	seedMatch({ seasonId, group: 1, round, p1Id: 'p1', p2Id: 'p2' });

describe('result writes award', () => {
	it('report, and an edit after it keeps what was earned (award-only)', () => {
		seedPlayers(2);
		const m = open(season('a').id);
		saveReport(m, 'p1', result(2, 0));
		expect(row('p1', 'first-blood')).toBeDefined();
		organizerEdit({ ...m, reportedBy: 'p1' }, 'p2', result(0, 2));
		expect(row('p1', 'first-blood')).toBeDefined();
		expect(row('p2', 'first-blood')).toBeDefined();
	});

	it('flag resolve', () => {
		seedPlayers(2);
		const m = win(season('a').id, 1, 1);
		flagMatch(m, 'p2', 'wrong');
		keepResult(m, 'p1');
		expect(row('p1', 'first-blood')!.unlockedAt).toEqual(D(1));
	});

	it('week publish counts an earlier hidden result, dated by its report', () => {
		seedPlayers(2);
		const s = season('a', { publishedRound: 1 });
		win(s.id, 2, 3);
		publishWeek(s.id, 1, [2, 2], 'p1');
		expect(row('p1', 'first-blood')!.unlockedAt).toEqual(D(3));
	});

	it('finalize awards Perfect Group; undrop recounts', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 1);
		dropPlayer(s.id, 'p2', 'p1');
		finalizeSeason(s.id, 'p1', false);
		expect(row('p1', 'perfect-group')).toBeUndefined(); // only match void
		cancelDrop(s.id, 'p2', 'p1');
		expect(row('p1', 'perfect-group')).toBeDefined();
		expect(row('p1', 'first-blood')).toBeDefined();
	});
});
```

Append to `topCut.spec.ts` (import `playerAchievements` from the schema and `and` from drizzle):

```ts
describe('achievements', () => {
	const has = (playerId: string, id: string) =>
		!!db
			.select()
			.from(playerAchievements)
			.where(
				and(eq(playerAchievements.playerId, playerId), eq(playerAchievements.achievementId, id))
			)
			.get();

	it('publishing awards Top Cut to the bracket; finishing awards Champion', () => {
		publishCut(season(), null, 'p1');
		expect(['p1', 'p2', 'p4', 'p5'].map((p) => has(p, 'top-cut'))).toEqual([
			true,
			true,
			true,
			true
		]);
		expect(has('p3', 'top-cut')).toBe(false);
		walkover(season(), slot(1, 0).match!, 'p1', 'p1');
		walkover(season(), slot(1, 1).match!, 'p4', 'p1');
		walkover(season(), slot(2, 0).match!, 'p1', 'p1');
		expect(has('p1', 'champion')).toBe(false);
		finishCut(season(), 'p1', 'p1');
		expect(has('p1', 'champion')).toBe(true);
		expect(has('p4', 'champion')).toBe(false);
	});
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/server/achievements.spec.ts src/lib/server/topCut.spec.ts`
Expected: FAIL on the "result writes award" and "achievements" tests (no rows).

- [ ] **Step 3: Implement.** Import `{ awardAchievements, awardSeason } from '#lib/server/achievements.ts'` in each file and add one line after each function's `db.transaction(...)`:
  - `matches.ts`: `saveReport`, `organizerEdit`, `keepResult` → `awardAchievements(db, [m.p1Id, m.p2Id]);`
  - `seasons.ts`: `publishWeek`, `finalizeSeason` (before the `syncSeasonRoles` line), `cancelDrop` (before `syncPlayerRoles`) → `awardSeason(db, seasonId);`
  - `topCut.ts`: `publishCut`, `finishCut` (before `syncSeasonRoles`) → `awardSeason(db, season.id);`

  This runs after the commit on purpose: a bug in award code must never block a report, and the next start's backfill heals anything missed.

- [ ] **Step 4: Run all tests and confirm they pass**

Run: `npx vitest run && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server
git commit -m "feat(achievements): award after every result write"
```

---

### Task 7: Backfill on start, plus a manual script

**Files:**

- Modify: `src/hooks.server.ts`, `package.json`
- Create: `scripts/backfill-achievements.ts`

- [ ] **Step 1: The init hook** (`hooks.server.ts`: change the type import to `import type { Handle, ServerInit } from '@sveltejs/kit/hooks';`)

```ts
import { backfillAchievements } from '#lib/server/achievements.ts';
import { db } from '#lib/server/db/index.ts';

// Every start, so every deploy: award what the current rules find in past results. Award-only, so
// a rerun changes nothing. The prod image has no scripts/ for this beyond migrate.ts.
export const init: ServerInit = () => backfillAchievements(db);
```

- [ ] **Step 2: The manual script** `scripts/backfill-achievements.ts`

```ts
// Awards what existing results have earned (the app also does this on every start). Idempotent.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { backfillAchievements } from '#lib/server/achievements.ts';
import * as schema from '#lib/server/db/schema.ts';

process.loadEnvFile();
const client = new Database(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });
const count = () =>
	client.prepare('select count(*) n from player_achievements').get() as { n: number };
const before = count().n;
backfillAchievements(db);
console.log(`Awarded ${count().n - before} achievements (${count().n} in all).`);
```

Add to `package.json` scripts: `"db:backfill-achievements": "node scripts/backfill-achievements.ts"`.

- [ ] **Step 3: Verify on a copy of the dev DB** (never the live `local.db` with a dev server attached)

```bash
cp local.db /tmp/claude-1000/ach-check.db
DATABASE_URL=/tmp/claude-1000/ach-check.db node scripts/migrate.ts
DATABASE_URL=/tmp/claude-1000/ach-check.db node scripts/backfill-achievements.ts
DATABASE_URL=/tmp/claude-1000/ach-check.db node scripts/backfill-achievements.ts
```

`process.loadEnvFile()` doesn't override a variable that's already set. Expected: the first run prints `Awarded N…` with N > 0, and the second prints `Awarded 0…`.

- [ ] **Step 4: Run** `npm run check && npx vitest run`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks.server.ts scripts/backfill-achievements.ts package.json
git commit -m "feat(achievements): backfill on every start and on demand"
```

---

### Task 8: Self-hosted icons

**Files:**

- Create: `scripts/fetch-icons.ts`, `static/achievements/champions/*.png` (57), `static/achievements/tiers/{bronze,silver,gold}.{png,svg}`, `static/achievements/items/*.png` (7)
- Modify: `package.json`
- Test: `src/lib/league/achievements.spec.ts`

- [ ] **Step 1: Write the failing test** (append; `import { existsSync } from 'node:fs';`, plus `crest, emblem` in the import)

```ts
describe('icons', () => {
	it('are all in static/', () => {
		const paths = [
			...ACHIEVEMENTS.map((a) => a.icon),
			...(['bronze', 'silver', 'gold'] as const).flatMap((t) => [emblem(t), crest(t)])
		];
		expect(paths.filter((p) => !existsSync(`static${p}`))).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx vitest run src/lib/league/achievements.spec.ts`. Expected: FAIL, listing every path.

- [ ] **Step 3: Write `scripts/fetch-icons.ts` and run it once**

```ts
// Downloads the achievement icons into static/achievements/ (self-hosted, no hotlinking). Rerun
// after adding a legend to src/lib/legends.ts, and commit the files. Riot's assets, used under
// "Legal Jibber Jabber" (src/lib/legal.ts, in the footer).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { champion, key } from '#lib/league/achievements.ts';
import { LEGENDS } from '#lib/legends.ts';

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/16.21.1';
const CDRAGON =
	'https://raw.communitydragon.org/16.21/plugins/rcp-fe-lol-static-assets/global/default/images';
const OUT = 'static/achievements';
const ITEMS = {
	'first-blood': 'spell/SummonerDot',
	'veteran-3': 'item/3340',
	'veteran-10': 'item/3026',
	'perfect-group': 'item/3031',
	comeback: 'spell/SummonerHeal',
	'top-cut': 'spell/SummonerFlash',
	champion: 'item/3089'
};

async function get(url: string, file: string) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const { data } = (await (await fetch(`${DDRAGON}/data/en_US/champion.json`)).json()) as {
	data: Record<string, { id: string; name: string }>;
};
const ids = new Map(Object.values(data).map((c) => [c.name, c.id]));
for (const name of new Set(LEGENDS.map(champion))) {
	const id = ids.get(name);
	if (!id) throw new Error(`No Data Dragon champion named ${name}`);
	await get(`${DDRAGON}/img/champion/${id}.png`, `${OUT}/champions/${key(name)}.png`);
}
for (const t of ['bronze', 'silver', 'gold']) {
	await get(`${CDRAGON}/ranked-emblem/emblem-${t}.png`, `${OUT}/tiers/${t}.png`);
	await get(`${CDRAGON}/ranked-mini-crests/${t}.svg`, `${OUT}/tiers/${t}.svg`);
}
for (const [id, path] of Object.entries(ITEMS))
	await get(`${DDRAGON}/img/${path}.png`, `${OUT}/items/${id}.png`);
console.log(`Icons saved to ${OUT}/.`);
```

Add `"icons:fetch": "node scripts/fetch-icons.ts"` to `package.json`. Run `npm run icons:fetch`, then `ls static/achievements/champions | wc -l` (expect `57`) and `du -sh static/achievements` (expect about 2 MB).

- [ ] **Step 4: Run the test and confirm it passes.** Run: `npx vitest run src/lib/league/achievements.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-icons.ts static/achievements package.json src/lib/league/achievements.spec.ts
git commit -m "feat(achievements): self-hosted champion, emblem and item icons"
```

---

### Task 9: (dropped) DS re-sync

#141 replaces `porobound.css` wholesale from the current DS, including `--tier-bronze/silver/gold` (dark `#c98d5e/#b6c0cb/#e9c25b`, light `#93552a/#5f6b78/#7f5c00`). Task 1 checks that it's there. If the tokens are missing anyway, stop and ask; don't hand-edit the snapshot.

---

### Task 10: Career view model

**Files:**

- Modify: `src/lib/server/achievements.ts`
- Test: `src/lib/server/achievements.spec.ts`

- [ ] **Step 1: Write the failing test** (append; import `careerAchievements`)

```ts
describe('careerAchievements', () => {
	it('shows started legend tracks, league tracks and one-offs; earned rows win over progress', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 1);
		win(s.id, 2, 2);
		db.insert(playerAchievements)
			.values([
				{ playerId: 'p1', achievementId: 'legend-jinx-master', unlockedAt: D(5), seasonId: null },
				{ playerId: 'p1', achievementId: 'legend-renamed-player', unlockedAt: D(5), seasonId: null }
			])
			.run();
		const c = careerAchievements(db, 'p1');
		expect(c.earned).toBe(1); // unknown ids don't count
		expect(c.legends.map((t) => t.title)).toEqual(['Jinx', 'Ahri']);
		const [jinx, ahri] = c.legends;
		expect(jinx.tiles.map((t) => [t.earned, t.have])).toEqual([
			[null, 0],
			[null, 0],
			['2026-01-05', 25]
		]);
		expect(ahri.tiles[0]).toMatchObject({
			name: 'Ahri Player',
			have: 2,
			need: 3,
			earned: null,
			crest: '/achievements/tiers/bronze.svg'
		});
		expect(c.tracks.map((t) => [t.title, t.tiles.map((x) => x.have)])).toEqual([
			['Variety', [0, 0, 0]],
			['Dice rolls', [2, 2, 2]]
		]);
		expect(c.ones.map((t) => t.id)).toEqual([
			'first-blood',
			'veteran-3',
			'veteran-10',
			'perfect-group',
			'comeback',
			'top-cut',
			'champion'
		]);
		expect(c.ones[0]).toMatchObject({ have: 1, need: 1, earned: null, crest: null }); // seeded rows weren't awarded
	});
});
```

- [ ] **Step 2: Run it and confirm it fails.** Expected: FAIL, `careerAchievements` is not exported.

- [ ] **Step 3: Implement** (append to `src/lib/server/achievements.ts`; extend the league import with `ACHIEVEMENTS, crest, type Tier`, and add `import { leagueDate } from '#lib/league/time.ts';`)

```ts
export type Tile = {
	id: string;
	name: string;
	description: string;
	tier: Tier | null;
	icon: string;
	crest: string | null; // legend tiles: the tier crest over the champion icon
	earned: string | null; // league date it unlocked
	have: number;
	need: number;
};
export type TrackView = { track: string; title: string; tiles: Tile[] };
const LEAGUE_TRACKS: Record<string, string> = { variety: 'Variety', dice: 'Dice rolls' };

// The career page's Achievements: earned from the table (award-only), progress derived now.
export function careerAchievements(db: Db, playerId: string) {
	const earned = new Map(
		db
			.select()
			.from(playerAchievements)
			.where(eq(playerAchievements.playerId, playerId))
			.all()
			.map((r) => [r.achievementId, r.unlockedAt])
	);
	const have = new Map(evaluate(playerHistory(db, playerId)).map((p) => [p.id, p.have]));
	const tracks = new Map<string, TrackView>();
	for (const a of ACHIEVEMENTS) {
		const at = earned.get(a.id);
		const t = tracks.get(a.track) ?? {
			track: a.track,
			title: a.legend ?? LEAGUE_TRACKS[a.track] ?? a.name,
			tiles: []
		};
		t.tiles.push({
			id: a.id,
			name: a.name,
			description: a.description,
			tier: a.tier,
			icon: a.icon,
			crest: a.legend && a.tier ? crest(a.tier) : null,
			earned: at ? leagueDate(at) : null,
			have: at ? a.need : have.get(a.id)!,
			need: a.need
		});
		tracks.set(a.track, t);
	}
	const all = [...tracks.values()];
	return {
		earned: ACHIEVEMENTS.filter((a) => earned.has(a.id)).length,
		legends: all
			.filter((t) => t.track.startsWith('legend-') && t.tiles.some((x) => x.have > 0))
			.sort((a, b) => b.tiles[2].have - a.tiles[2].have || a.title.localeCompare(b.title)),
		tracks: all.filter((t) => t.track in LEAGUE_TRACKS),
		ones: all.filter((t) => t.tiles.length === 1).map((t) => t.tiles[0])
	};
}
export type Career = ReturnType<typeof careerAchievements>;
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run: `npx vitest run src/lib/server/achievements.spec.ts && npm run check`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/achievements.ts src/lib/server/achievements.spec.ts
git commit -m "feat(achievements): career view model"
```

---

### Task 11: Achievements on the career page

**Files:**

- Create: `src/lib/components/Achievements.svelte`, `e2e/achievements.spec.ts`
- Modify: `src/routes/players/[id]/+page.server.ts`, `src/routes/players/[id]/+page.svelte`, `src/lib/server/pages.spec.ts`, `e2e/fixtures.ts`, `e2e/db.ts`, `e2e/mobile.spec.ts`

Design reference: Claude Design `PlayerCareer` and `MobileCareer` boards (Achievements section). Take the layout and tokens from them, not their copy or thresholds. The issue wins on those: the designs' "Win N matches", "Seasons played 1/3/5", "Match wins", "Clean sweep" and "Full season" are not in scope. Replace the designs' placeholder SVG shields with the real icons: a champion square with a tier ring and crest for legend tiles, the emblem for Variety/Dice, and the item icon for one-offs.

- [ ] **Step 1: Write the failing e2e test.** Add `achievements: 'e2e-achievements'` to `SEASONS` in `e2e/fixtures.ts`, and add to `e2e/db.ts`:

```ts
// Achievements as if just earned (the site only awards on result writes, and seeds bypass them).
export const seedAchievements = (playerId: string, ids: string[]) =>
	write((db) => {
		const add = db.prepare(
			'insert or ignore into player_achievements (player_id, achievement_id, unlocked_at) values (?, ?, unixepoch())'
		);
		for (const id of ids) add.run(playerId, id);
	});
```

`e2e/achievements.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.achievements;
const me = player('achievements', 1);
const name = playerName('achievements', 1);
let third: number; // round 3: Achievements 1 vs Achievements 4

// Two Ahri matches already in (seeded, so nothing awarded): a 2–0 win and a 0–2 loss.
test.beforeAll(() => {
	const ids = seedSeason('achievements', { publishedRound: 3 });
	seedResult(ids[0], 2, 0);
	seedResult(ids[2], 0, 2);
	third = ids[4];
});
test.afterAll(() => removeSeason('achievements'));
test.use(as(me));

test('a report that crosses a threshold shows the achievement on the career page', async ({
	page
}) => {
	const section = page.getByRole('region', { name: 'Achievements' });
	const tile = (n: string) =>
		section.getByRole('listitem').filter({ has: page.getByText(n, { exact: true }) });

	await page.goto(`/players/${me}`);
	await expect(
		tile('Ahri Player').getByRole('progressbar', { name: 'Ahri Player progress' })
	).toHaveAttribute('aria-valuenow', '2');
	await expect(tile('Ahri Player')).toContainText('2/3');

	await page.goto(`/seasons/${slug}/matches/${third}`);
	await page.getByLabel('Legend').nth(0).selectOption('Ahri');
	await page.getByLabel('Legend').nth(1).selectOption('Annie');
	await page.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel(name).check();
	for (const g of [1, 2])
		await page
			.getByRole('radiogroup', { name: new RegExp(`^Game ${g}`) })
			.getByLabel(name)
			.check();
	await page.getByRole('button', { name: 'Add result' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(page.getByRole('status')).toContainText('Result saved');

	await page.goto(`/players/${me}`);
	await expect(tile('Ahri Player')).toContainText(/Earned \d{1,2} \w{3} \d{4}/);
	await expect(tile('Ahri Player').getByRole('progressbar')).toHaveCount(0);
	await expect(tile('First Blood')).toContainText('Earned');
	await expect(tile('Ahri Expert')).toContainText('3/10');
});
```

In `e2e/mobile.spec.ts`, import `seedAchievements` and add to `beforeAll`: `seedAchievements(me, ['first-blood', 'veteran-10', 'legend-renata-glasc-master', 'legend-master-yi-pg-expert']);` That covers earned tiles and long names at 390 px. The page is already in the visitor list.

- [ ] **Step 2: Run them and confirm they fail.** Run: `npm run test:e2e -- e2e/achievements.spec.ts`. Expected: FAIL, no region "Achievements".

- [ ] **Step 3: Load.** In `src/routes/players/[id]/+page.server.ts`, import `careerAchievements` and `db` and add `achievements: careerAchievements(db, params.id)` to the returned object.

- [ ] **Step 4: Component** `src/lib/components/Achievements.svelte`

```svelte
<script lang="ts">
	import { date } from '#lib/format.ts';
	import type { Career, Tile, TrackView } from '#lib/server/achievements.ts';

	let { data }: { data: Career } = $props();
	const TIER = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;
</script>

{#snippet tile(t: Tile)}
	<div class="tile" data-state={t.earned ? 'earned' : 'locked'} data-tier={t.tier}>
		<span class="ico">
			<img src={t.icon} alt="" width="48" height="48" class={[t.crest && 'champ']} />
			{#if t.crest}<img class="crest" src={t.crest} alt="" width="20" height="15" />{/if}
		</span>
		<span class="tx">
			<span class="tier">{t.tier ? TIER[t.tier] : 'One-off'}</span>
			<span class="nm">{t.name}</span>
			<span class="pb-sr">{t.earned ? 'Earned.' : 'Locked.'}</span>
			<span class="ds">{t.description}</span>
			{#if t.earned}
				<span class="dt">Earned {date(t.earned)}</span>
			{:else}
				<span class="prog">
					<span
						class="bar"
						role="progressbar"
						aria-label="{t.name} progress"
						aria-valuemin="0"
						aria-valuemax={t.need}
						aria-valuenow={t.have}><span style:width="{(t.have / t.need) * 100}%"></span></span
					>
					<span class="cnt">{t.have}/{t.need}</span>
				</span>
			{/if}
		</span>
	</div>
{/snippet}

{#snippet track(tr: TrackView)}
	<section class="track" aria-label={tr.title}>
		<div class="track-h">
			<span class="track-t">{tr.title}</span>
			<span class="track-c">{tr.tiles.filter((t) => t.earned).length} of {tr.tiles.length}</span>
		</div>
		<ol class="steps">
			{#each tr.tiles as t (t.id)}<li>{@render tile(t)}</li>{/each}
		</ol>
	</section>
{/snippet}

<section class="ach" aria-labelledby="ach-h">
	<div class="ach-head">
		<h2 id="ach-h">Achievements</h2>
		<span class="muted small">{data.earned} earned</span>
	</div>
	<h3 class="eyebrow">Legend tracks</h3>
	{#if data.legends.length}
		<div class="tracks">
			{#each data.legends as tr (tr.track)}{@render track(tr)}{/each}
		</div>
	{:else}
		<p class="empty">A legend track starts with the first match played as that legend.</p>
	{/if}
	<h3 class="eyebrow">League tracks</h3>
	<div class="tracks">
		{#each data.tracks as tr (tr.track)}{@render track(tr)}{/each}
	</div>
	<h3 class="eyebrow">One-offs</h3>
	<ul class="ones">
		{#each data.ones as t (t.id)}<li>{@render tile(t)}</li>{/each}
	</ul>
</section>

<style>
	.ach {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.ach-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 16px;
	}
	h3 {
		margin: 4px 0 0;
	}
	ol,
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tracks {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr));
		gap: 16px;
	}
	.track {
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		min-width: 0;
	}
	.track-h {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 14px 16px 0;
	}
	.track-t {
		font: 600 17px/24px var(--font-display);
	}
	.track-c {
		margin-left: auto;
		font: 500 13px/18px var(--font-mono);
		color: var(--ink-muted);
		white-space: nowrap;
	}
	.steps {
		display: flex;
		gap: 8px;
		padding: 12px 16px 16px;
	}
	.steps > li {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
	}
	.ones {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
		gap: 16px;
	}
	.tile {
		--tier: var(--accent);
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		padding: 12px;
		border-radius: var(--radius-md);
		background: var(--surface);
	}
	.tile[data-tier='bronze'] {
		--tier: var(--tier-bronze);
	}
	.tile[data-tier='silver'] {
		--tier: var(--tier-silver);
	}
	.tile[data-tier='gold'] {
		--tier: var(--tier-gold);
	}
	.ones .tile {
		height: 100%;
		box-sizing: border-box;
		flex-direction: row;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		background: var(--surface-raised);
		border: 1px solid var(--line);
	}
	.ico {
		flex: none;
		position: relative;
		width: 48px;
		height: 48px;
	}
	.ico > img:first-child {
		width: 48px;
		height: 48px;
		box-sizing: border-box;
		border-radius: var(--radius-md);
		object-fit: cover; /* emblems are 16:9 with the crest centred */
	}
	.champ {
		border: 2px solid var(--tier);
	}
	.crest {
		position: absolute;
		right: -6px;
		bottom: -4px;
		height: auto;
	}
	.tx {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.tier {
		font: 600 11px/16px var(--font-sans);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--tier);
	}
	.nm {
		font-weight: 600;
		font-size: 15px;
		line-height: 20px;
	}
	.ds {
		font-size: 13px;
		line-height: 18px;
		color: var(--ink-muted);
	}
	.dt {
		margin-top: 2px;
		font-size: 12px;
		line-height: 16px;
		color: var(--ink-muted);
	}
	.prog {
		align-self: stretch;
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}
	.bar {
		flex: 1;
		display: block;
		min-width: 40px;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--line);
		overflow: hidden;
	}
	.bar > span {
		display: block;
		height: 100%;
		background: var(--ink-muted);
		border-radius: inherit;
	}
	.cnt {
		font: 500 12px/16px var(--font-mono);
		color: var(--ink-muted);
		white-space: nowrap;
	}
	[data-state='locked'] .ico {
		filter: grayscale(1);
		opacity: 0.55;
	}
	[data-state='locked'] :is(.nm, .tier) {
		color: var(--ink-muted);
	}
	[data-state='locked'] .champ {
		border-color: var(--line);
	}
	/* Phones: a track's tiers stack as a list (MobileCareer board). */
	@media (max-width: 640px) {
		.steps {
			flex-direction: column;
			gap: 0;
			padding: 8px 16px 12px;
		}
		.steps .tile {
			flex-direction: row;
			gap: 12px;
			padding: 8px 0;
			background: none;
		}
	}
</style>
```

- [ ] **Step 5: Render it.** In `src/routes/players/[id]/+page.svelte`, import `Achievements from '#lib/components/Achievements.svelte'` and place `<Achievements data={data.achievements} />` after the stats/empty block and before "Season by season". That's the order on the PlayerCareer board.

- [ ] **Step 6: Unit-test the load.** In `src/lib/server/pages.spec.ts`, inside `describe('drafts on public sub-pages')` next to "are left out of the career page" (its seed gives p1 a career), add:

```ts
it('career page carries achievements', async () => {
	db.insert(playerAchievements)
		.values({ playerId: 'p1', achievementId: 'champion', unlockedAt: new Date(), seasonId: null })
		.run();
	const d = await careerLoad(event({ id: 'p1' }, null));
	expect(d.achievements.earned).toBe(1);
	expect(
		d.achievements.ones.find((t: { id: string }) => t.id === 'champion').earned
	).not.toBeNull();
});
```

(Add `playerAchievements` to the schema import.)

- [ ] **Step 7: Run everything touched and confirm it passes**

Run: `npx vitest run src/lib/server/pages.spec.ts && npm run check && npm run test:e2e -- e2e/achievements.spec.ts e2e/mobile.spec.ts`
Expected: PASS, and the mobile spec reports no sideways scroll on `/players/mobile-1`.

- [ ] **Step 8: Look at it.** Start a dev server from the worktree on another port, per the worktree workflow, never a second `npm run dev` beside the owner's :5173. Open a career page in light and dark at 1280 px and 390 px and check that the emblem crop (`object-fit: cover`) shows the whole emblem. If it's clipped, switch `.ico > img:first-child` to `object-fit: contain` with `scale: 1.6` for non-champion tier icons, and say so in the PR.

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/Achievements.svelte src/routes/players src/lib/server/pages.spec.ts e2e
git commit -m "feat(achievements): Achievements section on the career page"
```

---

### Task 12: Dev data

**Files:**

- Modify: `scripts/reseed-dev.ts`, `scripts/report-dev.ts`, `scripts/play-dev.ts`, `package.json`, `README.md`
- Create: `scripts/achievements-dev.ts`

- [ ] **Step 1: `reseed-dev.ts` gives a spread of achievements with every tier present**
  1. Imports: `drizzle` from `drizzle-orm/better-sqlite3`, `* as schema` from `#lib/server/db/schema.ts`, `backfillAchievements` from `#lib/server/achievements.ts`, `ACHIEVEMENTS` from `#lib/league/achievements.ts`, `standings` from `#lib/league/standings.ts`, `drawBracket` from `#lib/league/bracket.ts`.
  2. Wipe: prepend `delete from player_achievements;` to the `db.exec` block, before `delete from audit`.
  3. Special players, right after `main` is built. Replace `legend`:

```ts
// Achievement spread: a one-trick (gold legend track), a flex player (gold Variety), a lucky
// roller (gold Dice), a newcomer with nothing, and Spring's perfect group stage.
const [PERFECT, FLEX, ONE_TRICK, LUCKY] = ids;
const NEWCOMER = ids[22];
const legend = (id: string) =>
	id === ONE_TRICK ? main.get(id)! : id === FLEX || rand() >= 0.75 ? pick(pool) : main.get(id)!;
const dice = (a: string, b: string) => ([a, b].includes(LUCKY) ? LUCKY : pick([a, b]));
```

4. In `season()`: add `perfect?: string` to the options. In the report loop, use `diceWinnerId: dice(m.a, m.b)`, and when `o.perfect` is `m.a` or `m.b`, replace `play(...)` with `{ games: m.a === o.perfect ? '11' : '22', p1Games: m.a === o.perfect ? 2 : 0, p2Games: m.a === o.perfect ? 0 : 2 }`.
5. A new season, created **first** so season ids stay in date order (`latestSeason` and `myPlayerPage` order by id):

```ts
const spring = season({
	slug: 'spring-2026',
	name: 'Spring 2026',
	status: 'finished',
	start: '2026-03-02',
	deadline: '2026-05-03',
	published: 15,
	players: [ME, ...ids.slice(0, 15)],
	groups: 1,
	played: () => true,
	perGame: () => true,
	perfect: PERFECT
});
log.run(spring.sid, null, ME, 'finalize', null, null, at('2026-03-02', 16));
cut(spring, '2026-03-02');
```

with this helper, defined after `season()`:

```ts
// A 4-player top cut seeded by group points, played to a champion, with the site's audit rows.
function cut(s: { sid: number; ms: M[] }, start: string) {
	const people = [...new Set(s.ms.flatMap((m) => [m.a, m.b]))];
	const results = s.ms
		.filter((m) => m.reported)
		.map((m) => ({ p1: m.a, p2: m.b, p1Games: m.reported!.p1Games, p2Games: m.reported!.p2Games }));
	const top = standings(
		people.map((playerId) => ({ playerId, dropped: false, tiebreak: null })),
		results,
		true
	)
		.slice(0, 4)
		.map((r) => r.playerId);
	const slots = drawBracket([top]) as string[];
	const seat = db.prepare(
		'update entries set seed = ?, slot = ? where season_id = ? and player_id = ?'
	);
	slots.forEach((p, i) => seat.run(top.indexOf(p) + 1, i, s.sid, p));
	log.run(s.sid, null, ME, 'topcut', null, JSON.stringify({ size: 4, date: null }), at(start, 17));
	const add = db.prepare(
		"insert into matches (season_id, stage, round, slot, p1_id, p2_id) values (?, 'playoff', ?, ?, ?, ?) returning id"
	);
	const match = (round: number, slot: number, a: string, b: string) => {
		const id = (add.get(s.sid, round, slot, a, b) as { id: number }).id;
		const r = {
			...play(a, b, true),
			p1Legend: legend(a),
			p2Legend: legend(b),
			diceWinnerId: dice(a, b)
		};
		const t = at(start, 17 + round);
		report.run(r.games, r.p1Games, r.p2Games, r.p1Legend, r.p2Legend, r.diceWinnerId, a, t, id);
		log.run(s.sid, id, a, 'report', null, JSON.stringify(r), t);
		// A level result sends the higher seed through, like the site.
		return r.p1Games !== r.p2Games
			? r.p1Games > r.p2Games
				? a
				: b
			: top.indexOf(a) < top.indexOf(b)
				? a
				: b;
	};
	const final = [match(1, 0, slots[0], slots[1]), match(1, 1, slots[2], slots[3])];
	const champion = match(2, 0, final[0], final[1]);
	log.run(s.sid, null, ME, 'champion', null, JSON.stringify({ champion }), at(start, 20));
}
```

6. The newcomer never plays. In autumn's `played`, return `false` first when `a === NEWCOMER || b === NEWCOMER`. In the drop/erase `candidate` query, change `and player_id <> ?` to `and player_id not in (?, ?)` and pass `ME, NEWCOMER`.
7. After the transaction, before the final `console.table`:

```ts
backfillAchievements(drizzle(db, { schema }));
const tier = new Map(ACHIEVEMENTS.map((a) => [a.id, a.tier ?? 'one-off']));
const got = db.prepare('select player_id p, achievement_id id from player_achievements').all() as {
	p: string;
	id: string;
}[];
console.log(
	'Achievements by tier:',
	Object.fromEntries(
		['bronze', 'silver', 'gold', 'one-off'].map((t) => [
			t,
			got.filter((g) => tier.get(g.id) === t).length
		])
	)
);
console.log(
	'Players with none:',
	db
		.prepare(
			'select count(*) n from players where id not in (select player_id from player_achievements)'
		)
		.get()
);
```

8. Update the header comment: "seeds four seasons: Spring finished with a top cut (per-game results, a perfect group stage, a champion), Summer finished (counts-only), Autumn in play (…), Winter draft". Add a line about the achievement players.

- [ ] **Step 2: Backfill in the other dev writers.** At the end of `report-dev.ts` and `play-dev.ts`, after their transaction, add `backfillAchievements(drizzle(db, { schema }));` with the same three imports. They write results with SQL, bypassing the app's award calls.

- [ ] **Step 3: `scripts/achievements-dev.ts`**

```ts
// Dev only: grants (dated now) or clears your achievements, to check tiles, locked and progress
// states, and long names. `none` clears; the next app start re-awards what your results earned.
import Database from 'better-sqlite3';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';

process.loadEnvFile();
const [discordId, ...what] = process.argv.slice(2);
if (!discordId || !what.length)
	throw new Error('usage: npm run db:achievements-dev -- <your-discord-id> <all|none|id…>');
const db = new Database(process.env.DATABASE_URL!);
const me = db.prepare('select id from players where discord_id = ?').get(discordId) as
	{ id: string } | undefined;
if (!me) throw new Error(`No player with Discord id ${discordId}; log in on the site first`);
const known = new Set(ACHIEVEMENTS.map((a) => a.id));
const ids = what.filter((w) => w !== 'all' && w !== 'none');
const unknown = ids.filter((id) => !known.has(id));
if (unknown.length)
	throw new Error(
		`Unknown achievement ${unknown.join(', ')}; ids are in src/lib/league/achievements.ts`
	);
db.transaction(() => {
	if (what.includes('none'))
		db.prepare('delete from player_achievements where player_id = ?').run(me.id);
	const add = db.prepare(
		'insert or ignore into player_achievements (player_id, achievement_id, unlocked_at) values (?, ?, unixepoch())'
	);
	for (const id of what.includes('all') ? known : ids) add.run(me.id, id);
})();
const { n } = db
	.prepare('select count(*) n from player_achievements where player_id = ?')
	.get(me.id) as { n: number };
console.log(`You have ${n} of ${known.size} achievements.`);
```

Add `"db:achievements-dev": "node scripts/achievements-dev.ts"` to `package.json`.

- [ ] **Step 4: README.** Under "Fake players", add:
  - `npm run db:achievements-dev -- <your-discord-id> <all|none|id…>` grants your player achievements (dated now) or clears them (`none`), to check tiles, progress and long names. Ids are in `src/lib/league/achievements.ts`, e.g. `legend-renata-glasc-master`, `first-blood`. The next app start re-awards what your results earned.
  - `db:reseed-dev` now seeds four seasons and runs the achievement backfill, so fake players span no achievements to many, with every tier.
  - `npm run db:backfill-achievements` awards what existing results earned. The app also does this on every start.

  In the commands table, add `db:achievements-dev` and `db:backfill-achievements` to the dev-data row, and add an `npm run icons:fetch` row ("Re-download achievement icons after adding a legend").

- [ ] **Step 5: Verify on a copy, so the owner's `local.db` and dev server are untouched**

```bash
cp local.db /tmp/claude-1000/ach-dev.db
DATABASE_URL=/tmp/claude-1000/ach-dev.db node scripts/migrate.ts
DATABASE_URL=/tmp/claude-1000/ach-dev.db node scripts/reseed-dev.ts <owner-discord-id>
DATABASE_URL=/tmp/claude-1000/ach-dev.db node scripts/achievements-dev.ts <owner-discord-id> all
DATABASE_URL=/tmp/claude-1000/ach-dev.db node scripts/achievements-dev.ts <owner-discord-id> none
DATABASE_URL=/tmp/claude-1000/ach-dev.db node scripts/achievements-dev.ts <owner-discord-id> nope
```

Get the owner's Discord id from `select discord_id from players where discord_id not like 'dev-%' limit 1` on the copy. Expected:

- the reseed's "Achievements by tier" shows bronze, silver, gold and one-off all > 0, and "Players with none" ≥ 1 (the newcomer);
- `all` prints `187 of 187`, `none` prints `0 of 187`, and `nope` throws "Unknown achievement nope".

If gold is 0 for a track, raise that special player's share (e.g. FLEX always picks from `pool`, which it already does) or give Spring more rounds, then rerun.

- [ ] **Step 6: Commit**

```bash
git add scripts package.json README.md
git commit -m "feat(achievements): dev data and achievements-dev script"
```

---

### Task 13: Docs

**Files:** Modify `docs/spec.md`, `docs/ops.md`.

- [ ] **Step 1: `docs/spec.md`.** Add a `## Achievements` section after "Pages". Cover: definitions in `src/lib/league/achievements.ts`; tiers (Player/Expert/Master = Bronze/Silver/Gold); the list (legend tracks 3/10/25, Variety 3/5/10, Dice 3/6/20, and the seven one-offs); counting rules (matches not games; void, double losses, walkovers and unpublished rounds don't count; playoff counts); award-only; triggers; unlock date rules; career page display; not in Discord or the API; no manual awards. In "Open items", remove "Career stats" only if that's already done (it is, since the career page exists). Otherwise leave it.
- [ ] **Step 2: `docs/ops.md`.** After "The container applies migrations on start", add: "It then awards any achievements the current rules find in past results (idempotent, award-only)". In the legend-rename paragraph, add: "Achievement ids are derived from legend names, so a rename leaves earned rows under the old id: rename them in `player_achievements` too (`legend-<old-key>-…` → `legend-<new-key>-…`)".
- [ ] **Step 3: Run** `npm run lint`. Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add docs/spec.md docs/ops.md
git commit -m "feat(achievements): document achievements in spec and ops"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run the full check suite**

```bash
npm run lint
npm run check
npx vitest run
npm run test:e2e
```

Expected: all green. The e2e list includes `achievements.spec.ts`, and `mobile.spec.ts` passes on `/players/mobile-1` with earned tiles.

- [ ] **Step 2: Break the fix once (CLAUDE.md regression rule).** Temporarily delete the `awardAchievements(db, [m.p1Id, m.p2Id]);` line in `saveReport`. Run `npx vitest run src/lib/server/achievements.spec.ts` and `npm run test:e2e -- e2e/achievements.spec.ts`; both must FAIL. Restore the line and rerun; both PASS.
- [ ] **Step 3: Spec coverage walk.** Check each issue section against a task: Model → T2–T4; Award-only → T5/T6 tests; counting and holiday → T1/T3; Triggers → T6; Backfill on deploy → T7; Achievements table → T2/T3; Display → T10/T11; Icons → T8 (tokens from #141); Tests → T3/T5/T6/T11; Dev data → T12.
- [ ] **Step 4: Check the visual by hand** (dev server from the worktree): a new player (the newcomer), a veteran (the one-trick or the Spring champion), and `db:achievements-dev all`, in both themes at desktop width and 390 × 844.
- [ ] **Step 5: Ask the owner before pushing.** Suggest `/code-review` before merge.
