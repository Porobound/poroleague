import { isPublished } from '#lib/league/publish.ts';
import type { Rank } from '#lib/league/ranks.ts';
import { isVoid } from '#lib/league/status.ts';
import type { Legend } from '#lib/legends.ts';

export type Tier = 'bronze' | 'silver' | 'gold';

// One achievement, for the career page and for cosmetics (#143). Rows store `id`: never rename one.
// A tiered id ends in its tier, not its name, so a tier can be renamed.
export type Achievement = {
	id: string;
	track: string; // the tiers of one track read as a progression; a one-off is its own track
	tier: Tier | null; // null for a one-off
	rank: Rank; // how hard it is, wood to challenger; the colour of its ring
	name: string;
	description: string;
	title: string; // shown with the player's name when equipped (#143)
	icon: string; // under static/
	legend: Legend | null; // a mastery badge's legend (mastery.ts); null for every achievement
	need: number; // hits to unlock
};

export type Hit = { at: Date; seasonId: number };
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
	finalAt: Date | null; // the player was in the final of a finished top cut
	// Where the player ended in their group, once it is finalized; null if dropped or not in one.
	group: { place: number; of: number; first: string; cut: number } | null;
};
export type History = { playerId: string; matches: HistoryMatch[]; seasons: HistorySeason[] };

// One counted match from the player's side. `games` per game: '1' = they won it, '2' = lost, 'D'.
type Played = {
	seasonId: number;
	stage: 'group' | 'playoff';
	at: Date;
	opponent: string;
	legend: string | null;
	vs: string | null; // the opponent's legend
	won: number;
	lost: number;
	games: string | null;
	dice: boolean;
	diceLost: boolean; // the opponent won the roll
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
				isPublished(m, s.publishedRound) &&
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
				opponent: me ? m.p2Id : m.p1Id,
				legend: me ? m.p1Legend : m.p2Legend,
				vs: me ? m.p2Legend : m.p1Legend,
				won: me ? m.p1Games! : m.p2Games!,
				lost: me ? m.p2Games! : m.p1Games!,
				games: m.games && (me ? m.games : flip(m.games)),
				dice: m.diceWinnerId === h.playerId,
				diceLost: !!m.diceWinnerId && m.diceWinnerId !== h.playerId
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

const byDate = (a: Hit, b: Hit) => a.at.getTime() - b.at.getTime();

// The longest run of matches that pass `f`: one hit each time the best run grows, so hit N is the
// match that first made a run of N.
const run =
	(f: (m: Played) => boolean): Hits =>
	(ms) => {
		let now = 0;
		const best: Hit[] = [];
		for (const m of ms) {
			now = f(m) ? now + 1 : 0;
			if (now > best.length) best.push(hit(m));
		}
		return best;
	};

// A win over someone who beat the player in an earlier season.
const revenge: Hits = (ms) => {
	const lostTo = new Map<string, number>(); // opponent → the first season they won in
	return ms.flatMap((m) => {
		const first = lostTo.get(m.opponent);
		if (m.lost > m.won && first === undefined) lostTo.set(m.opponent, m.seasonId);
		return won(m) && first !== undefined && first !== m.seasonId ? [hit(m)] : [];
	});
};

// A season the player finished: its group stage is finalized, they weren't dropped, and they
// played a counted match in it.
const finished = (ms: Played[], h: History) =>
	h.seasons.filter(
		(s) => s.finalizedAt && !s.dropped.has(h.playerId) && ms.some((m) => m.seasonId === s.id)
	);
// Achievements judged over a whole season: one hit per finished season that passes `f`, dated by
// its finalize. `sm` is the player's counted matches in that season.
const season =
	(f: (s: HistorySeason, sm: Played[], h: History) => boolean): Hits =>
	(ms, h) =>
		finished(ms, h)
			.filter((s) =>
				f(
					s,
					ms.filter((m) => m.seasonId === s.id),
					h
				)
			)
			.map((s) => ({ at: s.finalizedAt!, seasonId: s.id }))
			.sort(byDate);
const seasonsFinished = season(() => true);
const legends = (sm: Played[]) => {
	const count = new Map<string, number>();
	for (const m of sm) if (m.legend) count.set(m.legend, (count.get(m.legend) ?? 0) + 1);
	return [...count.values()];
};

const seasonEvent =
	(k: 'cutAt' | 'championAt' | 'finalAt'): Hits =>
	(_, h) =>
		h.seasons.flatMap((s) => (s[k] ? [{ at: s[k], seasonId: s.id }] : [])).sort(byDate);
type Def = Achievement & { hits: Hits };

export const key = (s: string) =>
	s
		.toLowerCase()
		.replace(/'/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
export const champion = (legend: string) => legend.replace(/ \((PG|XP)\)$/, '');
export const emblem = (t: Tier) => `/achievements/tiers/${t}.png`;

const TIERS = ['bronze', 'silver', 'gold'] as const;
type Three<T> = [T, T, T];

function tiered(
	track: string,
	names: Three<string>,
	describe: (n: number) => string,
	needs: Three<number>,
	ranks: Three<Rank>,
	hits: Hits,
	icon: (t: Tier) => string
): Def[] {
	return TIERS.map((tier, i) => ({
		id: `${track}-${tier}`,
		track,
		tier,
		rank: ranks[i],
		name: names[i],
		description: describe(needs[i]),
		title: names[i],
		icon: icon(tier),
		legend: null,
		need: needs[i],
		hits
	}));
}

const flat = (
	id: string,
	name: string,
	rank: Rank,
	description: string,
	hits: Hits,
	need = 1
): Def => ({
	id,
	track: id,
	tier: null,
	rank,
	name,
	description,
	title: name,
	icon: `/achievements/items/${id}.png`,
	legend: null,
	need,
	hits
});

// A one-off drawn with one of our own glyphs instead of a game icon.
const glyph = (...[id, ...rest]: Parameters<typeof flat>): Def => ({
	...flat(id, ...rest),
	icon: `/achievements/glyphs/${id}.svg`
});

const DEFS: Def[] = [
	...tiered(
		'variety',
		['Dabbler', 'Explorer', 'Polymath'],
		(n) => `Play ${n} different legends at least twice each.`,
		[3, 5, 10],
		['bronze', 'gold', 'platinum'],
		variety,
		emblem
	),
	...tiered(
		'dice',
		['Lucky', 'Charmed', 'Blessed'],
		(n) => `Win ${n} dice rolls.`,
		[3, 6, 20],
		['bronze', 'silver', 'emerald'],
		where((m) => m.dice),
		emblem
	),
	...tiered(
		'seasons',
		['Veteran', 'Old Guard', 'Elder'],
		(n) => `Finish ${n} seasons: play each to its end without dropping.`,
		[2, 3, 5],
		['gold', 'emerald', 'grandmaster'],
		seasonsFinished,
		() => '/achievements/items/seasons.png'
	),
	...tiered(
		'comeback',
		['Comeback Kid', 'Comeback King', 'Comeback Emperor'],
		(n) => (n === 1 ? 'Win a match after losing game 1.' : `Win ${n} matches after losing game 1.`),
		[1, 5, 15],
		['bronze', 'gold', 'diamond'],
		where((m) => m.games?.[0] === '2' && won(m)),
		() => '/achievements/items/comeback.png'
	),
	flat(
		'first-blood',
		'First Blood',
		'bronze',
		'Win the first game of a match.',
		where((m) => m.games?.[0] === '1')
	),
	...tiered(
		'wins',
		['Contender', 'Closer', 'Finisher'],
		(n) => `Win ${n} matches.`,
		[5, 15, 40],
		['bronze', 'gold', 'diamond'],
		where(won),
		() => '/achievements/glyphs/wins.svg'
	),
	...tiered(
		'streak',
		['Warm', 'Hot', 'On Fire'],
		(n) => `Win ${n} matches in a row.`,
		[3, 5, 8],
		['gold', 'emerald', 'diamond'],
		run(won),
		() => '/achievements/glyphs/streak.svg'
	),
	...tiered(
		'matches',
		['Regular', 'Stalwart', 'Marathoner'],
		(n) => `Play ${n} matches.`,
		[15, 30, 60],
		['silver', 'platinum', 'master'],
		where(() => true),
		() => '/achievements/glyphs/matches.svg'
	),
	glyph('on-the-board', 'On the Board', 'bronze', 'Win a match.', where(won)),
	glyph(
		'clean-sweep',
		'Clean Sweep',
		'bronze',
		'Win a match 2–0.',
		where((m) => m.won === 2 && m.lost === 0)
	),
	glyph(
		'stalemate',
		'Stalemate',
		'bronze',
		'Draw a match.',
		where((m) => m.won === m.lost)
	),
	glyph(
		'decider',
		'Decider',
		'silver',
		'Win 5 matches in game 3.',
		where((m) => m.games?.length === 3 && won(m)),
		5
	),
	glyph(
		'dice-dont-matter',
		"Dice Don't Matter",
		'silver',
		'Win 5 matches after losing the dice roll.',
		where((m) => m.diceLost && won(m)),
		5
	),
	glyph(
		'mirror-match',
		'Mirror Match',
		'gold',
		'Win a match where both players chose the same legend.',
		where((m) => !!m.legend && m.legend === m.vs && won(m))
	),
	glyph('revenge', 'Revenge', 'gold', 'Beat a player who beat you in an earlier season.', revenge),
	glyph(
		'swept',
		'Swept',
		'wood',
		'Lose a match 0–2.',
		where((m) => m.won === 0 && m.lost === 2)
	),
	glyph('snake-eyes', 'Snake Eyes', 'wood', 'Lose 5 dice rolls in a row.', (ms, h) =>
		run((m) => m.diceLost)(ms, h).slice(4, 5)
	),
	glyph(
		'one-trick',
		'One Trick',
		'silver',
		'Play more than half your matches in a season as one legend.',
		season((_, sm) => Math.max(0, ...legends(sm)) > sm.length / 2)
	),
	glyph(
		'flex-pick',
		'Flex Pick',
		'gold',
		'Play 5 different legends in a season.',
		season((_, sm) => legends(sm).length >= 5)
	),
	glyph(
		'giant-slayer',
		'Giant Slayer',
		'platinum',
		'Beat the player who finishes first in your group.',
		season(
			(s, sm, h) =>
				!!s.group &&
				s.group.first !== h.playerId &&
				sm.some((m) => m.stage === 'group' && m.opponent === s.group!.first && won(m))
		)
	),
	glyph(
		'group-winner',
		'Group Winner',
		'diamond',
		'Finish first in your group.',
		season((s) => s.group?.place === 1)
	),
	glyph(
		'bubble',
		'Bubble',
		'wood',
		'Finish one place below the top-cut line.',
		season((s) => !!s.group && s.group.cut > 0 && s.group.place === s.group.cut + 1)
	),
	glyph(
		'participation-trophy',
		'Participation Trophy',
		'wood',
		'Finish a season without a win.',
		season((_, sm) => !sm.some(won))
	),
	glyph(
		'wooden-spoon',
		'Wooden Spoon',
		'wood',
		'Finish last in your group.',
		season((s) => !!s.group && s.group.of > 1 && s.group.place === s.group.of)
	),
	flat('top-cut', 'Top Cut', 'gold', 'Qualify for a top cut.', seasonEvent('cutAt')),
	glyph('finalist', 'Finalist', 'grandmaster', 'Reach a top-cut final.', seasonEvent('finalAt')),
	flat('champion', 'Champion', 'challenger', "Win a season's top cut.", seasonEvent('championAt')),
	glyph(
		'dynasty',
		'Dynasty',
		'challenger',
		"Win two seasons' top cuts.",
		seasonEvent('championAt'),
		2
	)
];

export const ACHIEVEMENTS: readonly Achievement[] = DEFS;
export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

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
