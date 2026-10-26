import { describe, expect, it } from 'vitest';
import {
	bracket,
	bracketSize,
	cutFinish,
	drawBracket,
	MAX_CUT,
	matchName,
	roundName,
	seedLabel,
	seedOrder,
	winnerOf
} from './bracket';

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

const m = (round: number, slot: number, p1Id: string, p2Id: string, games?: [number, number]) => ({
	round,
	slot,
	p1Id,
	p2Id,
	p1Games: games?.[0] ?? null,
	p2Games: games?.[1] ?? null,
	reportedBy: games ? p1Id : null,
	walkoverId: null as string | null
});
const seed = (id: string) => Number(id.slice(1));

describe('winnerOf', () => {
	it('takes the games, then the higher seed on a level result, then a walkover', () => {
		expect(winnerOf(m(1, 0, 's1', 's4', [0, 2]), seed)).toBe('s4');
		expect(winnerOf(m(1, 0, 's4', 's1', [1, 1]), seed)).toBe('s1');
		expect(winnerOf(m(1, 0, 's1', 's4'), seed)).toBeNull();
		expect(winnerOf({ ...m(1, 0, 's1', 's4'), walkoverId: 's4' }, seed)).toBe('s4');
	});
});

describe('bracket', () => {
	const layout = ['s1', null, 's4', 's5', 's2', 's7', 's3', 's6']; // 7 players, s1 has a bye
	it('advances byes and winners, and leaves unknown slots empty', () => {
		const rounds = bracket(layout, [m(1, 1, 's4', 's5', [2, 0])], seed);
		expect(rounds.map((r) => r.length)).toEqual([4, 2, 1]);
		expect(rounds[0][0]).toMatchObject({ bye: true, winner: 's1', match: null });
		expect(rounds[1][0]).toMatchObject({ p1: 's1', p2: 's4', match: null, winner: null });
		expect(rounds[1][1]).toMatchObject({ p1: null, p2: null });
		expect(rounds[2][0].winner).toBeNull();
	});
});

describe('names', () => {
	it('names rounds and matches by how many players are left', () => {
		expect([1, 2, 3, 4].map((r) => roundName(r, 4))).toEqual([
			'Round of 16',
			'Quarterfinals',
			'Semifinals',
			'Final'
		]);
		expect(matchName(2, 1, 4)).toBe('Quarterfinal 2');
		expect(matchName(1, 2, 4)).toBe('Round of 16 · 3');
		expect(matchName(4, 0, 4)).toBe('Final');
	});
	it('labels seeds by group and place', () => {
		expect([1, 2, 3, 4].map((s) => seedLabel(s, 2))).toEqual(['A1', 'B1', 'A2', 'B2']);
		expect(seedLabel(5, 3)).toBe('B2');
	});
	it('names a player’s finish', () => {
		const rounds = bracket(
			['s1', 's4', 's2', 's3'],
			[m(1, 0, 's1', 's4', [2, 0]), m(1, 1, 's2', 's3', [0, 2]), m(2, 0, 's1', 's3', [2, 1])],
			seed
		);
		expect(['s1', 's3', 's4', 'x'].map((id) => cutFinish(rounds, id))).toEqual([
			'Champion',
			'Runner-up',
			'Semifinal',
			null
		]);
	});
});
