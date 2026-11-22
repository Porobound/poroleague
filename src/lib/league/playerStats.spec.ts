import { describe, expect, it } from 'vitest';
import { playerStats, rankByRound } from './playerStats';
import { standings } from './standings';

const group = (ids: string, dropped = '', ranks: Record<string, number> = {}) =>
	[...ids].map((playerId) => ({
		playerId,
		dropped: dropped.includes(playerId),
		tiebreak: ranks[playerId] ?? null
	}));
const m = (
	round: number,
	p1: string,
	p2: string,
	p1Games: number | null,
	p2Games: number | null,
	diceWinnerId: string | null = null,
	games: string | null = null
) => ({ round, p1, p2, p1Games, p2Games, diceWinnerId, games });
const shapes = (s: ReturnType<typeof playerStats>) =>
	Object.fromEntries(s.shapes.map((x) => [x.key, x.count]));
const all = group('abcdef');

describe('playerStats', () => {
	const stats = playerStats(
		all,
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
			all,
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
		const s = playerStats(
			all,
			[m(1, 'a', 'b', 1, 0), m(2, 'a', 'c', 0, 1), m(3, 'd', 'a', 0, 0)],
			'a'
		);
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

	it('counts matches that went to a third game, from the score when games are not recorded', () => {
		expect(stats.deciders).toEqual({ played: 3, wins: 2 });
	});

	it('counts a drawn game as a game played when working out who reached game 3', () => {
		const s = playerStats(
			all,
			[
				m(1, 'a', 'b', 1, 1, null, '1D2'), // 1–1 over three games
				m(2, 'a', 'c', 2, 0, null, 'D11'), // 2–0 after a drawn first game
				m(3, 'd', 'a', 1, 0, null, '1DD'), // lost 0–1, two games drawn
				m(4, 'a', 'e', 2, 0, null, '11'), // two games
				m(5, 'a', 'f', 1, 1, null, '12') // 1–1 called on time after two
			],
			'a'
		);
		expect(s.deciders).toEqual({ played: 3, wins: 1 });
	});

	it('splits wins by who won the dice roll, leaving out unrecorded rolls', () => {
		expect(stats.dice.with).toEqual({ played: 3, wins: 2 });
		expect(stats.dice.without).toEqual({ played: 2, wins: 1 });
	});

	it('is empty for a player with no matches', () => {
		const none = playerStats(all, [], 'a');
		expect(none.played).toBe(0);
		expect(none.winRate).toBeNull();
		expect(none.streak).toBeNull();
		expect(none.bestWins).toBe(0);
	});

	describe('unplayed matches', () => {
		const four = group('abcd');
		const ms = [m(1, 'a', 'b', 2, 0, 'a'), m(2, 'a', 'c', null, null), m(3, 'd', 'a', null, null)];

		it('are left out while they can still be played', () => {
			const s = playerStats(four, ms, 'a');
			expect(s.played).toBe(1);
			expect([s.wins, s.draws, s.losses]).toEqual([1, 0, 0]);
			expect(s.winRate).toBe(1);
		});

		it('are losses with no games once the deadline has passed', () => {
			const s = playerStats(four, ms, 'a', true);
			expect([s.wins, s.draws, s.losses]).toEqual([1, 0, 2]);
			expect(s.winRate).toBeCloseTo(1 / 3);
			expect(s.games).toEqual({ won: 2, lost: 0 });
			expect(s.form.map((f) => f.unplayed)).toEqual([false, true, true]);
			expect(s.streak).toEqual({ letter: 'L', length: 2 });
			expect(shapes(s)).toMatchObject({ sweep: 1, draw: 0, unplayed: 2 });
			expect(s.dice.without).toEqual({ played: 0, wins: 0 });
		});
	});

	describe('agrees with the standings row, given the same inputs', () => {
		// d dropped, so a's win over d is void. Round 3 is unpublished: masked as unplayed.
		const entries = group('abcd', 'd');
		const ms = [
			m(1, 'a', 'b', 2, 0),
			m(1, 'c', 'd', 2, 0),
			m(2, 'a', 'd', 2, 0),
			m(2, 'b', 'c', 1, 1),
			m(3, 'a', 'c', null, null),
			m(3, 'b', 'd', null, null)
		];
		for (const closed of [false, true])
			for (const id of 'abc')
				it(`${id}, deadline ${closed ? 'passed' : 'ahead'}`, () => {
					const row = standings(entries, ms, closed).find((x) => x.playerId === id)!;
					const s = playerStats(entries, ms, id, closed);
					expect([s.played, s.wins, s.draws, s.losses]).toEqual([
						row.played,
						row.wins,
						row.draws,
						row.losses
					]);
					expect([s.games.won, s.games.lost]).toEqual([row.gameWins, row.gameLosses]);
				});

		it('leaves out a void match: a keeps one win, not two', () => {
			expect(playerStats(entries, ms, 'a').wins).toBe(1);
		});

		it('counts a masked round as a loss after the deadline: 1–0–1, not 1–0–0', () => {
			const s = playerStats(entries, ms, 'a', true);
			expect([s.wins, s.draws, s.losses]).toEqual([1, 0, 1]);
			expect(s.winRate).toBe(0.5);
		});

		it('is empty for a dropped player, who has no row', () => {
			expect(playerStats(entries, ms, 'd').played).toBe(0);
		});
	});
});

describe('rankByRound', () => {
	const entries = group('abc');
	const season = [
		m(1, 'a', 'b', 0, 2),
		m(2, 'a', 'c', 2, 1),
		m(3, 'b', 'c', 0, 2),
		m(4, 'a', 'b', null, null)
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

	it('skips a round nobody has played yet', () => {
		const four = group('abcd');
		const ms = [
			m(1, 'a', 'b', null, null),
			m(1, 'c', 'd', null, null),
			m(2, 'b', 'c', 2, 0),
			m(2, 'a', 'd', 0, 2)
		];
		expect(rankByRound(four, ms, 'b').map((x) => x.round)).toEqual([2]);
		// After the deadline round 1 counts, as double losses.
		expect(rankByRound(four, ms, 'b', true).map((x) => x.round)).toEqual([1, 2]);
	});

	describe('level players', () => {
		// a and b both win rounds 1 and 2 without meeting, then draw each other.
		const ms = [
			m(1, 'a', 'c', 2, 0),
			m(1, 'b', 'd', 2, 0),
			m(2, 'a', 'd', 2, 0),
			m(2, 'b', 'c', 2, 0),
			m(3, 'a', 'b', 1, 1),
			m(3, 'c', 'd', 2, 0)
		];
		const open = group('abcd');
		const ranked = group('abcd', '', { b: 1, a: 2 });

		it('are not marked tied while the season is still being played', () => {
			expect(rankByRound(open, ms, 'b').map((x) => x.tied)).toEqual([false, false, false]);
		});

		it('are marked tied on the last round after the deadline, until an organizer orders them', () => {
			expect(rankByRound(open, ms, 'b', true).map((x) => x.tied)).toEqual([false, false, true]);
			expect(rankByRound(ranked, ms, 'b', true).map((x) => x.tied)).toEqual([false, false, false]);
		});

		it("apply an organizer's tie ranks to the last round only", () => {
			// Entry order puts a first while nothing separates them; the ranks put b first.
			expect(rankByRound(open, ms, 'b', true).map((x) => x.rank)).toEqual([2, 2, 2]);
			expect(rankByRound(ranked, ms, 'b', true).map((x) => x.rank)).toEqual([2, 2, 1]);
			expect(rankByRound(ranked, ms, 'a', true).map((x) => x.rank)).toEqual([1, 1, 2]);
		});
	});

	it('gives a dropped player no place', () => {
		expect(rankByRound(group('abc', 'a'), [m(1, 'a', 'b', 2, 0)], 'a')).toEqual([]);
	});

	it('is empty before anything is played', () => {
		expect(rankByRound(entries, [m(1, 'a', 'b', null, null)], 'a')).toEqual([]);
	});
});
