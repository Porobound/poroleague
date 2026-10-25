import { describe, expect, it } from 'vitest';
import { isValidScore, matchPoints, scoreGames } from './score';

describe('isValidScore', () => {
	it('accepts Bo3 results, matches called at 1-0, and 1-1 or 0-0 draws', () => {
		for (const [a, b] of [
			[2, 0],
			[2, 1],
			[1, 0],
			[0, 1],
			[1, 1],
			[0, 2],
			[1, 2],
			[0, 0]
		]) {
			expect(isValidScore(a, b)).toBe(true);
		}
	});
	it('rejects impossible scores', () => {
		for (const [a, b] of [
			[2, 2],
			[3, 0],
			[-1, 2]
		]) {
			expect(isValidScore(a, b)).toBe(false);
		}
	});
});

describe('matchPoints', () => {
	it('3/0 for a win, 1/1 for a draw', () => {
		expect(matchPoints(2, 1)).toEqual([3, 0]);
		expect(matchPoints(0, 2)).toEqual([0, 3]);
		expect(matchPoints(1, 1)).toEqual([1, 1]);
		expect(matchPoints(0, 0)).toEqual([1, 1]);
	});
});

const seq = (s: string) => [...s.padEnd(3, ' ')].map((c) => c.trim());

describe('scoreGames', () => {
	it('derives counts from every valid sequence', () => {
		for (const [s, p1, p2] of [
			['11', 2, 0],
			['121', 2, 1],
			['212', 1, 2],
			['22', 0, 2],
			['1', 1, 0],
			['12', 1, 1],
			['1D2', 1, 1],
			['D12', 1, 1],
			['DD1', 1, 0],
			['1D1', 2, 0],
			['D', 0, 0],
			['DD', 0, 0],
			['DDD', 0, 0]
		] as const)
			expect(scoreGames(seq(s)), s).toEqual({ ok: true, games: s, p1, p2 });
	});

	it('only ever derives scores from the valid set', () => {
		const all = ['', '1', '2', 'D'];
		for (const a of all)
			for (const b of all)
				for (const c of all) {
					const r = scoreGames([a, b, c]);
					if (r.ok) expect(isValidScore(r.p1, r.p2)).toBe(true);
				}
	});

	it('rejects a missing game 1, a gap, a game after 2–0, and unknown values', () => {
		expect(scoreGames(['', '', ''])).toEqual({
			ok: false,
			error: 'Pick the result of game 1.',
			game: 0
		});
		expect(scoreGames(['', '1', ''])).toMatchObject({ ok: false, game: 0 });
		expect(scoreGames(['1', '', '2'])).toEqual({
			ok: false,
			error: "Game 3 can't be played without game 2.",
			game: 2
		});
		expect(scoreGames(['1', '1', '2'])).toEqual({
			ok: false,
			error: "Game 3 can't be played: the match was already 2–0.",
			game: 2
		});
		expect(scoreGames(['2', '2', 'D'])).toMatchObject({ ok: false, game: 2 });
		expect(scoreGames(['1', 'x', ''])).toEqual({
			ok: false,
			error: "That isn't a possible Bo3 result.",
			game: 1
		});
	});
});
