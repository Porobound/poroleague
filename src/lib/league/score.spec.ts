import { describe, expect, it } from 'vitest';
import { isValidScore, matchPoints } from './score';

describe('isValidScore', () => {
	it('accepts Bo3 results, matches called at 1-0, and draws', () => {
		for (const [a, b] of [
			[2, 0],
			[2, 1],
			[1, 0],
			[0, 1],
			[1, 1],
			[0, 2],
			[1, 2]
		]) {
			expect(isValidScore(a, b)).toBe(true);
		}
	});
	it('rejects impossible scores', () => {
		for (const [a, b] of [
			[2, 2],
			[3, 0],
			[0, 0],
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
	});
});
