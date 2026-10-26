import { describe, expect, it } from 'vitest';
import { defaultGroupCount, MAX_PLAYERS, splitGroups } from './groups';

const items = Array.from({ length: 25 }, (_, i) => i);

describe('splitGroups', () => {
	it('splits into near-equal groups and keeps everyone', () => {
		const groups = splitGroups(items, 2);
		expect(groups.map((g) => g.length)).toEqual([13, 12]);
		expect(groups.flat().sort((a, b) => a - b)).toEqual(items);
	});

	it('one group holds everyone', () => {
		expect(splitGroups(items, 1)[0]).toHaveLength(25);
	});

	it('is deterministic with an injected random source', () => {
		const rng = () => 0.42;
		expect(splitGroups(items, 2, rng)).toEqual(splitGroups(items, 2, rng));
	});
});

describe('defaultGroupCount', () => {
	it('groups of at most 16', () => {
		for (const [players, groups] of [
			[0, 1],
			[2, 1],
			[16, 1],
			[17, 2],
			[32, 2],
			[33, 3],
			[MAX_PLAYERS, 8]
		])
			expect(defaultGroupCount(players), `${players} players`).toBe(groups);
	});
});
