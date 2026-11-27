import { isPublished } from '#lib/league/publish.ts';
import { isVoid } from '#lib/league/status.ts';
import { LEGENDS, type Legend } from '#lib/legends.ts';

export type Tier = 'bronze' | 'silver' | 'gold';

// One achievement, for the career page and for cosmetics (#143). Rows store `id`: never rename one.
// A tiered id ends in its tier, not its name, so a tier can be renamed.
export type Achievement = {
	id: string;
	track: string; // the tiers of one track read as a progression; a one-off is its own track
	tier: Tier | null; // null for a one-off
	name: string;
	description: string;
	title: string; // shown with the player's name when equipped (#143)
	icon: string; // under static/
	legend: Legend | null; // legend tracks only
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

const byDate = (a: Hit, b: Hit) => a.at.getTime() - b.at.getTime();

const perfect: Hits = (ms, h) =>
	h.seasons
		.flatMap((s) => {
			if (!s.finalizedAt) return [];
			const scheduled = h.matches.filter(
				(m) =>
					m.seasonId === s.id && m.stage === 'group' && mine(m, h.playerId) && !isVoid(m, s.dropped)
			).length;
			const wins = ms.filter((m) => m.seasonId === s.id && m.stage === 'group' && won(m)).length;
			return scheduled && wins === scheduled ? [{ at: s.finalizedAt, seasonId: s.id }] : [];
		})
		.sort(byDate);

const seasonEvent =
	(k: 'cutAt' | 'championAt'): Hits =>
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
// Most tracks name their tiers after the track: "Ahri Player", "Ahri Expert", "Ahri Master".
const levels = (label: string): Three<string> => [
	`${label} Player`,
	`${label} Expert`,
	`${label} Master`
];

function tiered(
	track: string,
	names: Three<string>,
	describe: (n: number) => string,
	needs: Three<number>,
	hits: Hits,
	icon: (t: Tier) => string,
	legend: Legend | null = null
): Def[] {
	return TIERS.map((tier, i) => ({
		id: `${track}-${tier}`,
		track,
		tier,
		name: names[i],
		description: describe(needs[i]),
		title: names[i],
		icon: icon(tier),
		legend,
		need: needs[i],
		hits
	}));
}

const flat = (id: string, name: string, description: string, hits: Hits): Def => ({
	id,
	track: id,
	tier: null,
	name,
	description,
	title: name,
	icon: `/achievements/items/${id}.png`,
	legend: null,
	need: 1,
	hits
});

const DEFS: Def[] = [
	...LEGENDS.flatMap((l) =>
		tiered(
			`legend-${key(l)}`,
			levels(l),
			(n) => `Play ${n} matches as ${l}.`,
			[3, 10, 25],
			where((m) => m.legend === l),
			() => `/achievements/champions/${key(champion(l))}.png`,
			l
		)
	),
	...tiered(
		'variety',
		levels('Variety'),
		(n) => `Play at least 2 matches each with ${n} different legends.`,
		[3, 5, 10],
		variety,
		emblem
	),
	...tiered(
		'dice',
		levels('Dice'),
		(n) => `Win ${n} dice rolls.`,
		[3, 6, 20],
		where((m) => m.dice),
		emblem
	),
	...tiered(
		'seasons',
		['Veteran', 'Old Guard', 'Elder'],
		(n) => `Play in ${n} seasons.`,
		[2, 5, 10],
		seasonsPlayed,
		() => '/achievements/items/seasons.png'
	),
	...tiered(
		'comeback',
		['Comeback Kid', 'Comeback King', 'Comeback Emperor'],
		(n) => (n === 1 ? 'Win a match after losing game 1.' : `Win ${n} matches after losing game 1.`),
		[1, 5, 15],
		where((m) => m.games?.[0] === '2' && won(m)),
		() => '/achievements/items/comeback.png'
	),
	flat('first-blood', 'First Blood', 'Win your first match.', where(won)),
	flat('perfect-group', 'Perfect Group', 'Win every group match of a season.', perfect),
	flat('top-cut', 'Top Cut', 'Reach a top cut.', seasonEvent('cutAt')),
	flat('champion', 'Champion', 'Win a top-cut final.', seasonEvent('championAt'))
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
