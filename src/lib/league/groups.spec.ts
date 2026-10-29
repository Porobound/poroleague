import { describe, expect, it } from 'vitest';
import {
	DEFAULT_GROUP_SIZE,
	defaultGroupCount,
	groupPlan,
	MAX_PLAYERS,
	maxPlayersFor,
	splitGroups
} from './groups';

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
	it('fewest groups of at most the group size', () => {
		for (const [players, size, groups] of [
			[0, 16, 1],
			[2, 16, 1],
			[16, 16, 1],
			[17, 16, 2],
			[33, 16, 3],
			[MAX_PLAYERS, 16, 8],
			[13, 12, 2],
			[32, 32, 1],
			[33, 32, 2],
			[48, 6, 8]
		])
			expect(defaultGroupCount(players, size), `${players} at ${size}`).toBe(groups);
		expect(defaultGroupCount(17)).toBe(defaultGroupCount(17, DEFAULT_GROUP_SIZE));
	});
});

describe('groupPlan', () => {
	it('gives the group count and the smallest and largest group', () => {
		expect(groupPlan(23, 12)).toEqual({ count: 2, min: 11, max: 12 });
		expect(groupPlan(24, 12)).toEqual({ count: 2, min: 12, max: 12 });
		expect(groupPlan(0, 12)).toEqual({ count: 1, min: 0, max: 0 });
	});
});

describe('maxPlayersFor', () => {
	it('is 8 groups of the size, never past 128', () => {
		expect(maxPlayersFor(6)).toBe(48);
		expect(maxPlayersFor(16)).toBe(128);
		expect(maxPlayersFor(32)).toBe(128);
	});
});
