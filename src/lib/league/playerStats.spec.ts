import { describe, expect, it } from 'vitest';
import { playerStats, rankByRound } from './playerStats';

const m = (
	round: number,
	p1Id: string,
	p2Id: string,
	p1Games: number,
	p2Games: number,
	diceWinnerId: string | null = null
) => ({ round, p1Id, p2Id, p1Games, p2Games, diceWinnerId });

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
		expect(stats.form[2]).toEqual({ round: 3, letter: 'L', won: 1, lost: 2 });
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

	it('groups scores by how the match went', () => {
		expect(Object.fromEntries(stats.shapes.map((s) => [s.key, s.count]))).toEqual({
			sweep: 2,
			'close-win': 2,
			draw: 1,
			'close-loss': 1,
			swept: 0
		});
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
});

describe('rankByRound', () => {
	const entries = ['a', 'b', 'c'].map((playerId) => ({ playerId, dropped: false, tiebreak: null }));
	const r = (
		round: number,
		p1: string,
		p2: string,
		p1Games: number | null,
		p2Games: number | null
	) => ({
		round,
		p1,
		p2,
		p1Games,
		p2Games
	});

	it('replays the standings after each played round', () => {
		const ranks = rankByRound(
			entries,
			[
				r(1, 'a', 'b', 0, 2),
				r(2, 'a', 'c', 2, 1),
				r(3, 'b', 'c', 0, 2),
				r(4, 'a', 'b', null, null)
			],
			'a'
		);
		// Round 1: a lost, but has played, so sits above c. Round 2: level with b, who beat them.
		// Round 3: all on 3 points having all met, so game-win % orders them: c 60%, b 50%, a 40%.
		expect(ranks).toEqual([
			{ round: 1, rank: 2, points: 0 },
			{ round: 2, rank: 2, points: 3 },
			{ round: 3, rank: 3, points: 3 }
		]);
	});

	it('gives a dropped player no place', () => {
		const dropped = entries.map((e) => ({ ...e, dropped: e.playerId === 'a' }));
		expect(rankByRound(dropped, [r(1, 'a', 'b', 2, 0)], 'a')).toEqual([]);
	});

	it('is empty before anything is played', () => {
		expect(rankByRound(entries, [r(1, 'a', 'b', null, null)], 'a')).toEqual([]);
	});
});
