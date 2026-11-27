import { beforeEach, describe, expect, it } from 'vitest';
import { LEGENDS } from '#lib/legends.ts';
import {
	ACHIEVEMENTS,
	achievementById,
	champion,
	evaluate,
	key,
	type History,
	type HistoryMatch,
	type HistorySeason
} from '#lib/league/achievements.ts';

describe('definitions', () => {
	it('has unique ids: three tiers per legend and league track, and four one-offs', () => {
		expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
		expect(ACHIEVEMENTS).toHaveLength(LEGENDS.length * 3 + 4 * 3 + 4);
	});

	it('gives every legend a Player/Expert/Master track at 3/10/25', () => {
		for (const l of LEGENDS)
			expect(
				ACHIEVEMENTS.filter((a) => a.legend === l).map((a) => [a.id, a.tier, a.name, a.need])
			).toEqual([
				[`legend-${key(l)}-bronze`, 'bronze', `${l} Player`, 3],
				[`legend-${key(l)}-silver`, 'silver', `${l} Expert`, 10],
				[`legend-${key(l)}-gold`, 'gold', `${l} Master`, 25]
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
		expect(achievementById.get('legend-master-yi-xp-gold')!.icon).toBe(
			'/achievements/champions/master-yi.png'
		);
	});

	it('names the tiers of Seasons and Comeback on their own', () => {
		const rows = (track: string) =>
			ACHIEVEMENTS.filter((a) => a.track === track).map((a) => [a.id, a.name, a.need]);
		expect(rows('seasons')).toEqual([
			['seasons-bronze', 'Veteran', 2],
			['seasons-silver', 'Old Guard', 5],
			['seasons-gold', 'Elder', 10]
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
			['variety', 'bronze', 'Variety Player', 3],
			['variety', 'silver', 'Variety Expert', 5],
			['variety', 'gold', 'Variety Master', 10]
		]);
		expect(pick(['dice-bronze', 'dice-silver', 'dice-gold']).map((x) => x[3])).toEqual([3, 6, 20]);
		const flat = ACHIEVEMENTS.filter((a) => !a.tier).map((a) => [a.id, a.need]);
		expect(flat).toEqual([
			['first-blood', 1],
			['perfect-group', 1],
			['top-cut', 1],
			['champion', 1]
		]);
		for (const a of ACHIEVEMENTS) expect(a.title).toBe(a.name);
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
		expect(get(H(n(2)), 'legend-ahri-bronze')).toMatchObject({ have: 2, need: 3, hit: null });
		day = 0;
		const h = H(
			[...n(2), M({ p1Id: 'op', p2Id: 'me', p1Legend: 'Annie', p2Legend: 'Ahri', seasonId: 2 })],
			[S(), S({ id: 2 })]
		);
		expect(get(h, 'legend-ahri-bronze')).toMatchObject({ have: 3, hit: { at: D(3), seasonId: 2 } });
		expect(get(h, 'legend-ahri-silver')).toMatchObject({ have: 3, need: 10, hit: null });
	});

	it('count losses and mirrors: matches, not wins', () => {
		const h = H([
			M({ p1Games: 0, p2Games: 2 }),
			M({ p2Legend: 'Ahri' }),
			M({ p1Games: 1, p2Games: 1 })
		]);
		expect(get(h, 'legend-ahri-bronze').hit).toEqual({ at: D(3), seasonId: 1 });
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
		expect(get(h, 'variety-bronze')).toMatchObject({ have: 3, hit: { at: D(6) } });
		expect(get(H(n(5, { p1Legend: 'Ahri' })), 'variety-bronze').have).toBe(1);
	});

	it('Dice: rolls won', () => {
		const h = H([...n(2), M({ diceWinnerId: 'op' }), M()]);
		expect(get(h, 'dice-bronze')).toMatchObject({ have: 3, hit: { at: D(4) } });
	});
});

describe('seasons, comeback and one-offs', () => {
	it('First Blood: the first win, not a draw or loss', () => {
		const h = H([M({ p1Games: 1, p2Games: 1 }), M({ p1Games: 0, p2Games: 2 }), M()]);
		expect(get(h, 'first-blood').hit).toEqual({ at: D(3), seasonId: 1 });
	});

	it('Seasons: the first counted match of the Nth season', () => {
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
		expect(get(h, 'seasons-bronze')).toMatchObject({ have: 2, hit: { at: D(2), seasonId: 2 } });
		expect(get(h, 'seasons-silver')).toMatchObject({ have: 3, need: 5, hit: null });
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
		// Two perfect seasons: the earlier finalize dates it, whatever order the seasons come in.
		const later = S({ id: 2, finalizedAt: D(60) });
		expect(get(H([M(), M({ seasonId: 2 })], [later, fin]), 'perfect-group').hit).toEqual({
			at: D(30),
			seasonId: 1
		});
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
