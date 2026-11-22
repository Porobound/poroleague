import { describe, expect, it } from 'vitest';
import { cutGap } from './cutGap';

const rows = (...points: number[]) =>
	points.map((p, i) => ({ playerId: 'abcdefgh'[i], points: p, played: 1 }));

describe('cutGap', () => {
	const table = rows(9, 7, 6, 4, 4, 1);

	it('measures a player inside the cut against the first one outside', () => {
		expect(cutGap(table, 'a', 4)).toEqual({ inside: true, points: 5 });
		expect(cutGap(table, 'c', 4)).toEqual({ inside: true, points: 2 });
	});

	it('measures a player outside the cut against the last one inside', () => {
		expect(cutGap(table, 'f', 4)).toEqual({ inside: false, points: 3 });
	});

	it('gives zero either side of a tie on the line', () => {
		expect(cutGap(table, 'd', 4)).toEqual({ inside: true, points: 0 });
		expect(cutGap(table, 'e', 4)).toEqual({ inside: false, points: 0 });
	});

	it('follows the rows it is given, so a player who cannot qualify moves the line', () => {
		// With b erased and left out, e is fourth of the players who can qualify.
		const eligible = table.filter((r) => r.playerId !== 'b');
		expect(cutGap(table, 'e', 4)).toEqual({ inside: false, points: 0 });
		expect(cutGap(eligible, 'e', 4)).toEqual({ inside: true, points: 3 });
		expect(cutGap(eligible, 'b', 4)).toBeNull();
	});

	it('has nothing to say without a line', () => {
		expect(cutGap(table, 'a', 0)).toBeNull();
		expect(cutGap(table, 'a', 6)).toBeNull();
		expect(cutGap(table, 'a', 8)).toBeNull();
		expect(cutGap(table, 'z', 4)).toBeNull();
		expect(
			cutGap(
				table.map((r) => ({ ...r, played: 0 })),
				'a',
				4
			)
		).toBeNull();
	});
});
