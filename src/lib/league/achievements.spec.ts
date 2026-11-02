import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { LEGENDS } from '#lib/legends.ts';
import {
	ACHIEVEMENTS,
	achievementById,
	champion,
	crest,
	emblem,
	evaluate,
	key,
	type History,
	type HistoryMatch,
	type HistorySeason
} from '#lib/league/achievements.ts';

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
		day = 0;
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

describe('icons', () => {
	it('are all in static/', () => {
		const paths = [
			...ACHIEVEMENTS.map((a) => a.icon),
			...(['bronze', 'silver', 'gold'] as const).flatMap((t) => [emblem(t), crest(t)])
		];
		expect(paths.filter((p) => !existsSync(`static${p}`))).toEqual([]);
	});
});
