import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { compareRank, isRank } from '#lib/league/ranks.ts';
import {
	ACHIEVEMENTS,
	achievementById,
	champion,
	emblem,
	evaluate,
	key,
	type History,
	type HistoryMatch,
	type HistorySeason
} from '#lib/league/achievements.ts';

describe('definitions', () => {
	it('has unique ids: three tiers per track, and twenty-one one-offs', () => {
		expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
		expect(ACHIEVEMENTS).toHaveLength(7 * 3 + 21);
	});

	it('keys legends for ids and icons', () => {
		expect(["K'Sante", 'Jarvan IV', 'Master Yi (PG)', 'Renata Glasc'].map(key)).toEqual([
			'ksante',
			'jarvan-iv',
			'master-yi-pg',
			'renata-glasc'
		]);
		expect(champion('Master Yi (XP)')).toBe('Master Yi');
		expect(ACHIEVEMENTS.every((a) => a.legend === null)).toBe(true); // legends are mastery
	});

	it('names the tiers of Seasons and Comeback on their own', () => {
		const rows = (track: string) =>
			ACHIEVEMENTS.filter((a) => a.track === track).map((a) => [a.id, a.name, a.need]);
		expect(rows('seasons')).toEqual([
			['seasons-bronze', 'Veteran', 2],
			['seasons-silver', 'Old Guard', 3],
			['seasons-gold', 'Elder', 5]
		]);
		expect(rows('comeback')).toEqual([
			['comeback-bronze', 'Comeback Kid', 1],
			['comeback-silver', 'Comeback King', 5],
			['comeback-gold', 'Comeback Emperor', 15]
		]);
		expect(achievementById.get('comeback-bronze')!.description).toBe(
			'Win a match after losing game 1.'
		);
		expect(achievementById.get('comeback-gold')!.description).toBe(
			'Win 15 matches after losing game 1.'
		);
	});

	it('lists the league tracks and one-offs', () => {
		const pick = (ids: string[]) =>
			ids.map((id) => {
				const a = achievementById.get(id)!;
				return [a.track, a.tier, a.name, a.need];
			});
		expect(pick(['variety-bronze', 'variety-silver', 'variety-gold'])).toEqual([
			['variety', 'bronze', 'Dabbler', 3],
			['variety', 'silver', 'Explorer', 5],
			['variety', 'gold', 'Polymath', 10]
		]);
		expect(pick(['dice-bronze', 'dice-silver', 'dice-gold']).map((x) => x[3])).toEqual([3, 6, 20]);
		const flat = ACHIEVEMENTS.filter((a) => !a.tier).map((a) => [a.id, a.need]);
		expect(flat).toEqual([
			['first-blood', 1],
			['on-the-board', 1],
			['clean-sweep', 1],
			['stalemate', 1],
			['decider', 5],
			['dice-dont-matter', 5],
			['mirror-match', 1],
			['revenge', 1],
			['swept', 1],
			['snake-eyes', 1],
			['one-trick', 1],
			['flex-pick', 1],
			['giant-slayer', 1],
			['group-winner', 1],
			['bubble', 1],
			['participation-trophy', 1],
			['wooden-spoon', 1],
			['top-cut', 1],
			['finalist', 1],
			['champion', 1],
			['dynasty', 2]
		]);
		for (const a of ACHIEVEMENTS) expect(a.title).toBe(a.name);
	});

	it('ranks every achievement, and a track never drops a rank as it grows', () => {
		for (const a of ACHIEVEMENTS) expect(isRank(a.rank)).toBe(true);
		const rank = (id: string) => achievementById.get(id)!.rank;
		expect(rank('champion')).toBe('challenger');
		expect(rank('first-blood')).toBe('bronze');
		expect(['seasons-bronze', 'seasons-silver', 'seasons-gold'].map(rank)).toEqual([
			'gold',
			'emerald',
			'grandmaster'
		]);
		for (const defs of Map.groupBy(ACHIEVEMENTS, (a) => a.track).values())
			for (let i = 1; i < defs.length; i++)
				expect(compareRank(defs[i].rank, defs[i - 1].rank)).toBeGreaterThanOrEqual(0);
	});
});

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
	finalAt: null,
	group: null,
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
			get(
				H([M({ stage: 'playoff', round: 5, games: '11' })], [S({ publishedRound: 0 })]),
				'first-blood'
			).have
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
		expect(get(h, 'variety-bronze')).toMatchObject({ have: 3, hit: { at: D(6) } });
		expect(get(H(n(5, { p1Legend: 'Ahri' })), 'variety-bronze').have).toBe(1);
	});

	it('Dice: rolls won', () => {
		const h = H([...n(2), M({ diceWinnerId: 'op' }), M()]);
		expect(get(h, 'dice-bronze')).toMatchObject({ have: 3, hit: { at: D(4) } });
	});
});

describe('wins, streaks and match results', () => {
	const loss = { p1Games: 0, p2Games: 2 };
	const draw = { p1Games: 1, p2Games: 1 };

	it('Wins and Matches count every counted match', () => {
		const h = H([...n(5), ...n(10, loss)]);
		expect(get(h, 'wins-bronze').hit).toEqual({ at: D(5), seasonId: 1 });
		expect(get(h, 'wins-silver')).toMatchObject({ have: 5, need: 15, hit: null });
		expect(get(h, 'matches-bronze').hit).toEqual({ at: D(15), seasonId: 1 });
		expect(get(h, 'on-the-board').hit).toEqual({ at: D(1), seasonId: 1 });
	});

	it('Streak: the best run of wins; a draw or a loss ends it', () => {
		const h = H([...n(2), M(draw), ...n(3), M(loss), ...n(4)]);
		expect(get(h, 'streak-bronze').hit).toEqual({ at: D(6), seasonId: 1 });
		expect(get(h, 'streak-silver')).toMatchObject({ have: 4, need: 5, hit: null });
		expect(get(H([...n(2), M(loss), ...n(2)]), 'streak-bronze')).toMatchObject({ have: 2 });
	});

	it('Clean Sweep, Swept and Stalemate read the score', () => {
		const h = H([
			M({ p1Games: 2, p2Games: 1 }),
			M(),
			M(loss),
			M({ p1Games: 1, p2Games: 2 }),
			M(draw)
		]);
		expect(get(h, 'clean-sweep').hit).toEqual({ at: D(2), seasonId: 1 });
		expect(get(h, 'swept').hit).toEqual({ at: D(3), seasonId: 1 });
		expect(get(h, 'stalemate').hit).toEqual({ at: D(5), seasonId: 1 });
		const asP2 = H([M({ p1Id: 'op', p2Id: 'me' })]);
		expect(get(asP2, 'swept').hit).toEqual({ at: D(6), seasonId: 1 });
		expect(get(asP2, 'clean-sweep').hit).toBeNull();
	});

	it('Decider: wins that went to game 3, only with per-game results', () => {
		const three = { games: '121', p1Games: 2, p2Games: 1 };
		const h = H([
			...n(4, three),
			M({ p1Games: 2, p2Games: 1 }),
			M({ games: '122', p1Games: 1, p2Games: 2 })
		]);
		expect(get(h, 'decider')).toMatchObject({ have: 4, need: 5, hit: null });
		expect(get(H(n(5, three)), 'decider').hit).toEqual({ at: D(11), seasonId: 1 });
	});

	it("Dice Don't Matter and Snake Eyes: lost rolls, never a match without a roll", () => {
		const lostRoll = { diceWinnerId: 'op' };
		expect(get(H(n(5, lostRoll)), 'dice-dont-matter').hit).toEqual({ at: D(5), seasonId: 1 });
		expect(get(H(n(5, lostRoll)), 'snake-eyes').hit).toEqual({ at: D(10), seasonId: 1 });
		const broken = H([...n(4, lostRoll), M(), ...n(4, lostRoll), M({ diceWinnerId: null })]);
		expect(get(broken, 'snake-eyes').hit).toBeNull();
		expect(get(H(n(5, { diceWinnerId: null })), 'dice-dont-matter').have).toBe(0);
		expect(get(H(n(5, { ...lostRoll, ...loss })), 'dice-dont-matter').have).toBe(0);
	});

	it('Mirror Match: a win with both on the same legend', () => {
		const h = H([
			M({ p2Legend: 'Ahri', ...loss }),
			M({ p1Legend: null, p2Legend: null }),
			M({ p2Legend: 'Ahri' })
		]);
		expect(get(h, 'mirror-match').hit).toEqual({ at: D(3), seasonId: 1 });
	});

	it('Revenge: beating someone who won in an earlier season', () => {
		const seasons = [S(), S({ id: 2 })];
		const same = H([M(loss), M()], seasons);
		expect(get(same, 'revenge').hit).toBeNull(); // same season
		const later = H([M(loss), M({ seasonId: 2, p2Id: 'x' }), M({ seasonId: 2 })], seasons);
		expect(get(later, 'revenge').hit).toEqual({ at: D(5), seasonId: 2 });
		const never = H([M(), M({ seasonId: 2 })], seasons);
		expect(get(never, 'revenge').hit).toBeNull(); // they never beat me
	});
});

describe('achievements judged over a season', () => {
	const fin = (o: Partial<HistorySeason> = {}) => S({ finalizedAt: D(40), ...o });
	const at = { at: D(40), seasonId: 1 };

	it('wait for the finalize, and skip a player who dropped', () => {
		const ms = n(3);
		expect(get(H(ms), 'one-trick').hit).toBeNull();
		expect(get(H(ms, [fin()]), 'one-trick').hit).toEqual(at);
		expect(get(H(ms, [fin({ dropped: new Set(['me']) })]), 'one-trick').hit).toBeNull();
	});

	it('One Trick: more than half the season on one legend', () => {
		const half = H([...n(2), ...n(2, { p1Legend: 'Jinx' })], [fin()]);
		expect(get(half, 'one-trick').hit).toBeNull();
		const most = H([...n(3), ...n(2, { p1Legend: 'Jinx' })], [fin()]);
		expect(get(most, 'one-trick').hit).toEqual(at);
	});

	it('Flex Pick: five different legends in one season', () => {
		const five = ['Ahri', 'Jinx', 'Annie', 'Garen', 'Lux'].map((p1Legend) => M({ p1Legend }));
		expect(get(H(five, [fin()]), 'flex-pick').hit).toEqual(at);
		expect(get(H(five.slice(1), [fin()]), 'flex-pick').hit).toBeNull();
		const split = five.map((m, i) => ({ ...m, seasonId: i < 3 ? 1 : 2 }));
		expect(get(H(split, [fin(), fin({ id: 2 })]), 'flex-pick').hit).toBeNull();
	});

	it('Participation Trophy: a finished season without a win', () => {
		const lost = n(3, { p1Games: 0, p2Games: 2 });
		expect(get(H(lost, [fin()]), 'participation-trophy').hit).toEqual(at);
		expect(get(H([...lost, M()], [fin()]), 'participation-trophy').hit).toBeNull();
	});

	it('Group Winner, Wooden Spoon and Bubble read the final place', () => {
		const place = (place: number, cut = 2) =>
			H(n(1), [fin({ group: { place, of: 4, first: place === 1 ? 'me' : 'op', cut } })]);
		expect(get(place(1), 'group-winner').hit).toEqual(at);
		expect(get(place(2), 'group-winner').hit).toBeNull();
		expect(get(place(4), 'wooden-spoon').hit).toEqual(at);
		expect(get(place(3), 'wooden-spoon').hit).toBeNull();
		expect(get(place(3), 'bubble').hit).toEqual(at);
		expect(get(place(3, 0), 'bubble').hit).toBeNull(); // no top cut
		expect(get(H(n(1), [fin()]), 'wooden-spoon').hit).toBeNull(); // no place
		const alone = H(n(1), [fin({ group: { place: 1, of: 1, first: 'me', cut: 0 } })]);
		expect(get(alone, 'wooden-spoon').hit).toBeNull();
	});

	it('Giant Slayer: a group win over whoever finishes first', () => {
		const group = { place: 2, of: 4, first: 'top', cut: 2 };
		const beat = H([M({ p2Id: 'top' })], [fin({ group })]);
		expect(get(beat, 'giant-slayer').hit).toEqual(at);
		const lost = H([M({ p2Id: 'top', p1Games: 0, p2Games: 2 })], [fin({ group })]);
		expect(get(lost, 'giant-slayer').hit).toBeNull();
		const playoff = H([M({ p2Id: 'top', stage: 'playoff' })], [fin({ group })]);
		expect(get(playoff, 'giant-slayer').hit).toBeNull();
		const first = H([M()], [fin({ group: { ...group, place: 1, first: 'me' } })]);
		expect(get(first, 'giant-slayer').hit).toBeNull();
	});

	it('Finalist and Dynasty read the top-cut events', () => {
		const h = H(n(1), [
			S({ finalAt: D(50), championAt: D(50) }),
			S({ id: 2, finalAt: D(90) }),
			S({ id: 3, finalAt: D(120), championAt: D(120) })
		]);
		expect(get(h, 'finalist').hit).toEqual({ at: D(50), seasonId: 1 });
		expect(get(h, 'dynasty')).toMatchObject({ have: 2, need: 2, hit: { at: D(120), seasonId: 3 } });
		expect(get(H(n(1), [S({ championAt: D(50) })]), 'dynasty')).toMatchObject({
			have: 1,
			hit: null
		});
	});
});

describe('seasons, comeback and one-offs', () => {
	it('First Blood: winning game 1, whoever takes the match, only with per-game results', () => {
		const h = H([
			M(), // a score alone: no game 1 to read
			M({ games: '211', p1Games: 2, p2Games: 1 }),
			M({ games: '122', p1Games: 1, p2Games: 2 }),
			M({ p1Id: 'op', p2Id: 'me', games: '11', p1Games: 2, p2Games: 0 })
		]);
		expect(get(h, 'first-blood').hit).toEqual({ at: D(3), seasonId: 1 });
		const asP2 = H([M({ p1Id: 'op', p2Id: 'me', games: '22', p1Games: 0, p2Games: 2 })]);
		expect(get(asP2, 'first-blood').hit).toEqual({ at: D(5), seasonId: 1 });
	});

	it('Seasons: finalized seasons the player finished, dated by the finalize', () => {
		const h = H(
			[M({ seasonId: 1 }), M({ seasonId: 2 }), M({ seasonId: 3 }), M({ seasonId: 4 })],
			[
				S({ id: 1, finalizedAt: D(40) }),
				S({ id: 2, finalizedAt: D(30) }),
				S({ id: 3 }), // still running
				S({ id: 4, finalizedAt: D(50), dropped: new Set(['me']) }),
				S({ id: 5, finalizedAt: D(60) }) // entered, never played
			]
		);
		expect(get(h, 'seasons-bronze')).toMatchObject({ have: 2, hit: { at: D(40), seasonId: 1 } });
		expect(get(h, 'seasons-silver')).toMatchObject({ have: 2, need: 3, hit: null });
	});

	it('Comeback: won after losing game 1, only with per-game results', () => {
		const five = H(Array.from({ length: 5 }, () => M({ games: '211', p1Games: 2, p2Games: 1 })));
		expect(get(five, 'comeback-silver')).toMatchObject({ have: 5, hit: { at: D(5) } });
		expect(get(five, 'comeback-gold')).toMatchObject({ have: 5, need: 15, hit: null });
		expect(get(H([M({ games: '211', p1Games: 2, p2Games: 1 })]), 'comeback-bronze').have).toBe(1);
		expect(
			get(
				H([M({ p1Id: 'op', p2Id: 'me', games: '122', p1Games: 1, p2Games: 2, p2Legend: 'Ahri' })]),
				'comeback-bronze'
			).have
		).toBe(1);
		expect(get(H([M({ games: '121', p1Games: 2, p2Games: 1 })]), 'comeback-bronze').have).toBe(0);
		expect(get(H([M({ games: null, p1Games: 2, p2Games: 1 })]), 'comeback-bronze').have).toBe(0);
		expect(get(H([M({ games: 'D11' })]), 'comeback-bronze').have).toBe(0);
		expect(
			get(
				H([M({ p1Id: 'op', p2Id: 'me', games: 'D22', p1Games: 0, p2Games: 2 })]),
				'comeback-bronze'
			).have
		).toBe(0);
	});

	it('Top Cut and Champion: dated by the season event', () => {
		const h = H([], [S({ cutAt: D(40) }), S({ id: 2, cutAt: D(20), championAt: D(25) })]);
		expect(get(h, 'top-cut').hit).toEqual({ at: D(20), seasonId: 2 });
		expect(get(h, 'champion').hit).toEqual({ at: D(25), seasonId: 2 });
	});
});

describe('icons', () => {
	it('are all in static/', () => {
		const paths = [
			...ACHIEVEMENTS.map((a) => a.icon),
			...(['bronze', 'silver', 'gold'] as const).map(emblem)
		];
		expect(paths.filter((p) => !existsSync(`static${p}`))).toEqual([]);
	});
});
