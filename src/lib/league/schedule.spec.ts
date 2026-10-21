import { describe, expect, it } from 'vitest';
import { buildSchedule } from './schedule';

describe('buildSchedule', () => {
	it('numbers groups and rounds from 1 and keeps players inside their group', () => {
		const schedule = buildSchedule([
			['a1', 'a2', 'a3', 'a4'],
			['b1', 'b2', 'b3']
		]);
		const groupA = schedule.filter((m) => m.group === 1);
		const groupB = schedule.filter((m) => m.group === 2);
		expect(groupA).toHaveLength(6);
		expect(groupB).toHaveLength(3);
		expect(new Set(groupA.map((m) => m.round))).toEqual(new Set([1, 2, 3]));
		expect(groupB.every((m) => m.p1.startsWith('b') && m.p2.startsWith('b'))).toBe(true);
	});

	it('is empty for no groups', () => {
		expect(buildSchedule([])).toEqual([]);
	});
});
