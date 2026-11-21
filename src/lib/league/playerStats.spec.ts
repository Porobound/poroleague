import { describe, expect, it } from 'vitest';
import { playerStats, rankByRound } from './playerStats';
import { standings } from './standings';

const m = (
	round: number,
	p1Id: string,
	p2Id: string,
	p1Games: number | null,
	p2Games: number | null,
	diceWinnerId: string | null = null
) => ({ round, p1Id, p2Id, p1Games, p2Games, diceWinnerId });
const shapes = (s: ReturnType<typeof playerStats>) =>
	Object.fromEntries(s.shapes.map((x) => [x.key, x.count]));

describe('playerStats', () => {
	const stats = playerStats(
		[
			m(3, 'b', 'a', 2, 1, 'a'), // out of order on purpose
			m(1, 'a', 'b', 2, 0, 'a'),
			m(2, 'c', 'a', 1, 2, 'c'),
			m(4, 'a', 'd', 1, 1, 'd'),
			m(5, 'a', 'e', 2, 1),
			m(6, 'f', 'a', 0, 2, 'a'),
			m(1, 'c', 'd', 2, 0, 'c') // someone else's match
		],
		'a'
	);

	it('reads each match from the player side, oldest round first', () => {
		expect(stats.played).toBe(6);
		expect(stats.form.map((f) => f.letter).join('')).toBe('WWLDWW');
		expect(stats.form[2]).toEqual({ round: 3, letter: 'L', won: 1, lost: 2, unplayed: false });
	});

	it('counts results and games', () => {
		expect([stats.wins, stats.draws, stats.losses]).toEqual([4, 1, 1]);
		expect(stats.winRate).toBeCloseTo(4 / 6);
		expect(stats.games).toEqual({ won: 10, lost: 5 });
	});

	it('finds the current run and the best winning run', () => {
		expect(stats.streak).toEqual({ letter: 'W', length: 2 });
		expect(stats.bestWins).toBe(2);
	});

	it('finds a losing run, and keeps an earlier winning run as the best', () => {
		const s = playerStats(
			[m(1, 'a', 'b', 2, 0), m(2, 'a', 'c', 2, 1), m(3, 'a', 'd', 0, 2), m(4, 'e', 'a', 2, 1)],
			'a'
		);
		expect(s.streak).toEqual({ letter: 'L', length: 2 });
		expect(s.bestWins).toBe(2);
	});

	it('groups scores by how the match went', () => {
		expect(shapes(stats)).toEqual({
			sweep: 2,
			'close-win': 2,
			draw: 1,
			'close-loss': 1,
			swept: 0,
			unplayed: 0
		});
	});

	it('reads matches called on time: 1–0 a close win, 0–1 a close loss, 0–0 a draw', () => {
		const s = playerStats([m(1, 'a', 'b', 1, 0), m(2, 'a', 'c', 0, 1), m(3, 'd', 'a', 0, 0)], 'a');
		expect(s.form.map((f) => f.letter).join('')).toBe('WLD');
		expect(shapes(s)).toEqual({
			sweep: 0,
			'close-win': 1,
			draw: 1,
			'close-loss': 1,
			swept: 0,
			unplayed: 0
		});
		expect(s.deciders).toEqual({ played: 0, wins: 0 });
	});

	it('counts matches that went to a third game', () => {
		expect(stats.deciders).toEqual({ played: 3, wins: 2 });
	});

	it('splits wins by who won the dice roll, leaving out unrecorded rolls', () => {
		expect(stats.dice.with).toEqual({ played: 3, wins: 2 });
		expect(stats.dice.without).toEqual({ played: 2, wins: 1 });
	});

	it('is empty for a player with no matches', () => {
		const none = playerStats([], 'a');
		expect(none.played).toBe(0);
		expect(none.winRate).toBeNull();
		expect(none.streak).toBeNull();
		expect(none.bestWins).toBe(0);
	});

	describe('unplayed matches', () => {
		const ms = [m(1, 'a', 'b', 2, 0, 'a'), m(2, 'a', 'c', null, null), m(3, 'd', 'a', null, null)];

		it('are left out while they can still be played', () => {
			const s = playerStats(ms, 'a');
			expect(s.played).toBe(1);
			expect([s.wins, s.draws, s.losses]).toEqual([1, 0, 0]);
			expect(s.winRate).toBe(1);
		});

		it('are losses with no games once the deadline has passed, as in the standings', () => {
			const s = playerStats(ms, 'a', true);
			// The same matches through the standings give the same record.
			const row = standings(
				['a', 'b', 'c', 'd'].map((playerId) => ({ playerId, dropped: false, tiebreak: null })),
				ms.map((x) => ({ p1: x.p1Id, p2: x.p2Id, p1Games: x.p1Games, p2Games: x.p2Games })),
				true
			).find((x) => x.playerId === 'a')!;
			expect(s.played).toBe(row.played);
			expect([s.wins, s.draws, s.losses]).toEqual([row.wins, row.draws, row.losses]);
			expect([s.wins, s.draws, s.losses]).toEqual([1, 0, 2]);
			expect(s.winRate).toBeCloseTo(1 / 3);
			expect(s.games).toEqual({ won: 2, lost: 0 });
			expect(s.form.map((f) => f.unplayed)).toEqual([false, true, true]);
			expect(s.streak).toEqual({ letter: 'L', length: 2 });
			expect(shapes(s)).toMatchObject({ sweep: 1, draw: 0, unplayed: 2 });
			expect(s.dice.without).toEqual({ played: 0, wins: 0 });
		});
	});
});

describe('rankByRound', () => {
	const entries = ['a', 'b', 'c'].map((playerId) => ({ playerId, dropped: false, tiebreak: null }));
	const r = (
		round: number,
		p1: string,
		p2: string,
		p1Games: number | null,
		p2Games: number | null
	) => ({ round, p1, p2, p1Games, p2Games });
	const season = [
		r(1, 'a', 'b', 0, 2),
		r(2, 'a', 'c', 2, 1),
		r(3, 'b', 'c', 0, 2),
		r(4, 'a', 'b', null, null)
	];

	it('replays the standings after each played round', () => {
		// Round 1: a lost, but has played, so sits above c. Round 2: level with b, who beat them.
		// Round 3: all on 3 points having all met, so game-win % orders them: c 60%, b 50%, a 40%.
		expect(rankByRound(entries, season, 'a')).toEqual([
			{ round: 1, rank: 2, points: 0, tied: false },
			{ round: 2, rank: 2, points: 3, tied: false },
			{ round: 3, rank: 3, points: 3, tied: false }
		]);
	});

	it('ends on the place in the standings once the deadline has passed', () => {
		const ranks = rankByRound(entries, season, 'a', true);
		const table = standings(entries, season, true);
		expect(ranks).toHaveLength(4);
		expect(ranks.at(-1)!.rank).toBe(table.findIndex((x) => x.playerId === 'a') + 1);
		expect(ranks.at(-1)!.points).toBe(table.find((x) => x.playerId === 'a')!.points);
	});

	it('marks a place the tiebreakers have not settled, such as a tie at the cut line', () => {
		// Four players, top two advance. b and c each beat someone else 2–0 and have not met.
		const four = ['a', 'b', 'c', 'd'].map((playerId) => ({
			playerId,
			dropped: false,
			tiebreak: null
		}));
		const ms = [r(1, 'b', 'a', 2, 0), r(1, 'c', 'd', 2, 0)];
		const table = standings(four, ms);
		for (const id of ['b', 'c']) {
			const [after] = rankByRound(four, ms, id);
			expect(after.tied).toBe(true);
			expect(after.rank).toBe(table.findIndex((x) => x.playerId === id) + 1);
			expect(after.points).toBe(3);
		}
	});

	it('gives a dropped player no place', () => {
		const dropped = entries.map((e) => ({ ...e, dropped: e.playerId === 'a' }));
		expect(rankByRound(dropped, [r(1, 'a', 'b', 2, 0)], 'a')).toEqual([]);
	});

	it('is empty before anything is played', () => {
		expect(rankByRound(entries, [r(1, 'a', 'b', null, null)], 'a')).toEqual([]);
	});
});
