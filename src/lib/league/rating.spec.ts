import { describe, expect, it } from 'vitest';
import { ratings, START } from './rating';

const m = (p1: string, p2: string, p1Games: number, p2Games: number) => ({
	p1,
	p2,
	p1Games,
	p2Games
});

describe('ratings', () => {
	it('moves 16 between equals on a win, whatever the margin', () => {
		for (const [a, b] of [
			[2, 0],
			[2, 1],
			[1, 0]
		]) {
			const r = ratings([m('a', 'b', a, b)]);
			expect(r.get('a')).toBe(START + 16);
			expect(r.get('b')).toBe(START - 16);
		}
		expect(ratings([m('a', 'b', 0, 2)]).get('a')).toBe(START - 16);
	});
	it('treats any equal score as a draw, 0-0 included', () => {
		for (const [a, b] of [
			[1, 1],
			[0, 0]
		]) {
			const r = ratings([m('a', 'b', 2, 0), m('a', 'b', a, b)]);
			// The favourite loses rating on a draw.
			expect(r.get('a')).toBeCloseTo(START + 16 + 32 * (0.5 - 1 / (1 + 10 ** (-32 / 400))));
		}
		expect(ratings([m('a', 'b', 0, 0)]).get('a')).toBe(START);
	});
	it('depends on order', () => {
		const one = [m('a', 'b', 2, 0), m('b', 'c', 2, 0)];
		const r1 = ratings(one);
		const r2 = ratings(one.toReversed());
		expect(r1.get('c')).not.toBeCloseTo(r2.get('c')!);
	});
	it('is zero-sum', () => {
		const pairs = ['ab', 'cd', 'ac', 'bd', 'ad', 'bc'];
		const r = ratings(
			Array.from({ length: 60 }, (_, i) => m(pairs[i % 6][0], pairs[i % 6][1], i % 3, (i * 5) % 3))
		);
		const total = [...r.values()].reduce((s, x) => s + x, 0);
		expect(total).toBeCloseTo(START * r.size, 9);
	});
});
