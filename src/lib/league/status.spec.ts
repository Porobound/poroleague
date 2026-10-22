import { describe, expect, it } from 'vitest';
import { isOverdue, isVoid } from './status';

describe('isVoid', () => {
	it('voids a match once either player dropped', () => {
		const dropped = new Set(['b']);
		expect(isVoid({ p1Id: 'a', p2Id: 'b' }, dropped)).toBe(true);
		expect(isVoid({ p1Id: 'a', p2Id: 'c' }, dropped)).toBe(false);
	});
});

describe('isOverdue', () => {
	const open = { roundsPerWeek: 2, week: 3, inPlay: true, closed: false, voided: false };
	const m = (round: number, reportedBy: string | null = null) => ({ round, reportedBy });

	it('flags unreported matches from earlier weeks', () => {
		expect(isOverdue(m(4), open)).toBe(true); // week 2
		expect(isOverdue(m(5), open)).toBe(false); // this week
		expect(isOverdue(m(4, 'a'), open)).toBe(false);
	});
	it('stops once the match is void or reporting is over', () => {
		expect(isOverdue(m(4), { ...open, voided: true })).toBe(false);
		expect(isOverdue(m(4), { ...open, closed: true })).toBe(false);
		expect(isOverdue(m(4), { ...open, inPlay: false })).toBe(false);
	});
});
