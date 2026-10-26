import { describe, expect, it } from 'vitest';
import { bracketSize, drawBracket, MAX_CUT, seedOrder } from './bracket';

// groups × per players named by group letter and place: A1, A2, B1…
const qualifiers = (groups: number, per: number) =>
	Array.from({ length: groups }, (_, g) =>
		Array.from({ length: per }, (_, r) => `${String.fromCharCode(65 + g)}${r + 1}`)
	);
const pairs = (slots: (string | null)[]) =>
	Array.from({ length: slots.length / 2 }, (_, i) => [slots[2 * i], slots[2 * i + 1]]);

describe('bracketSize', () => {
	it('rounds up to a power of two, at least 2', () => {
		expect([2, 3, 4, 5, 8, 12, 15, 16, 17, 32].map(bracketSize)).toEqual([
			2, 4, 4, 8, 8, 16, 16, 16, 32, 32
		]);
	});
});

describe('seedOrder', () => {
	it('pairs 1 with the last seed and keeps 1 and 2 apart until the final', () => {
		expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
	});
});

describe('drawBracket', () => {
	it('cross-seeds two groups with no swaps', () => {
		expect(pairs(drawBracket(qualifiers(2, 4)))).toEqual([
			['A1', 'B4'],
			['B2', 'A3'],
			['B1', 'A4'],
			['A2', 'B3']
		]);
	});

	it('gives the byes to the top seeds', () => {
		const slots = drawBracket(qualifiers(3, 5)); // 15 → 16, one bye
		expect(pairs(slots).find(([a, b]) => !a || !b)).toEqual(['A1', null]);
	});

	it('one group keeps plain seed order', () => {
		expect(pairs(drawBracket(qualifiers(1, 4)))).toEqual([
			['A1', 'A4'],
			['A2', 'A3']
		]);
	});

	it('never pairs two players of one group in the first round', () => {
		for (let groups = 2; groups <= 8; groups++)
			for (let per = 1; groups * per <= MAX_CUT; per++) {
				const slots = drawBracket(qualifiers(groups, per));
				expect(slots.filter(Boolean).sort(), `${groups}×${per}`).toEqual(
					qualifiers(groups, per).flat().sort()
				);
				for (const [a, b] of pairs(slots))
					if (a && b) expect(a[0], `${groups}×${per}: ${a} v ${b}`).not.toBe(b[0]);
			}
	});
});
