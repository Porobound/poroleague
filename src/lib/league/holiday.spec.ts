import { describe, expect, it } from 'vitest';
import {
	awayWeeks,
	coversLabel,
	holidayWeeks,
	isUnlocked,
	requestError,
	unlockedWeeks,
	visibleTo,
	type Holiday
} from './holiday';

// Start Mon 5 Oct, 2 rounds a week, 11 rounds → 6 weeks, weeks 1–4 published, today 2 Nov.
const cal = {
	startDate: '2026-10-05',
	roundsPerWeek: 2,
	maxRound: 11,
	publishedRound: 8,
	deadline: '2026-11-22'
};
const today = '2026-11-02';
const err = (from: string, to: string, own: Holiday[] = []) =>
	requestError({ from, to }, { ...cal, today }, own);

describe('holidayWeeks', () => {
	it('maps a range to the weeks it overlaps that have rounds', () => {
		expect(holidayWeeks({ from: '2026-11-04', to: '2026-11-10' }, cal)).toEqual([5, 6]);
		expect(holidayWeeks({ from: '2026-11-02', to: '2026-11-08' }, cal)).toEqual([5]);
		expect(holidayWeeks({ from: '2026-11-16', to: '2026-11-22' }, cal)).toEqual([]); // week 7: no rounds
		expect(holidayWeeks({ from: '2026-09-01', to: '2026-10-06' }, cal)).toEqual([1]);
	});
});

describe('coversLabel', () => {
	it('names weeks and rounds', () => {
		expect(coversLabel([4, 5], 2, 11)).toBe('weeks 4–5 (rounds 7–10)');
		expect(coversLabel([6], 2, 11)).toBe('week 6 (round 11)');
		expect(coversLabel([5], 2, 11)).toBe('week 5 (rounds 9–10)');
		expect(coversLabel([], 2, 11)).toBe('');
	});
});

describe('requestError', () => {
	it('accepts a range in unpublished weeks', () =>
		expect(err('2026-11-03', '2026-11-12')).toBeNull());
	it('needs two dates, in order', () => {
		expect(err('', '2026-11-12')).toMatch(/first and last day/);
		expect(err('2026-02-30', '2026-11-12')).toMatch(/first and last day/);
		expect(err('2026-11-12', '2026-11-03')).toMatch(/before the first/);
	});
	it('starts today or later', () => {
		expect(err('2026-11-02', '2026-11-03')).toBeNull();
		expect(err('2026-11-01', '2026-11-03')).toMatch(/past/);
	});
	it('spans at most 4 weeks', () => {
		expect(err('2026-11-03', '2026-11-30')).not.toMatch(/4 weeks/); // 28 days: fails the deadline instead
		const late = { ...cal, deadline: '2026-12-31', today };
		expect(requestError({ from: '2026-11-03', to: '2026-12-01' }, late, [])).toMatch(/4 weeks/);
	});
	it('ends by the deadline', () => expect(err('2026-11-20', '2026-11-23')).toMatch(/deadline/));
	it('covers an unpublished week', () => {
		expect(err('2026-11-16', '2026-11-20')).toMatch(/still to be published/);
		const later = { ...cal, publishedRound: 10, today };
		expect(requestError({ from: '2026-11-03', to: '2026-11-05' }, later, [])).toMatch(
			/still to be published/
		);
	});
	it("doesn't overlap the player's pending or approved holidays", () => {
		const own = (status: Holiday['status']) => [
			{ playerId: 'a', from: '2026-11-08', to: '2026-11-09', status }
		];
		expect(err('2026-11-03', '2026-11-08', own('pending'))).toMatch(/already/);
		expect(err('2026-11-09', '2026-11-12', own('approved'))).toMatch(/already/);
		for (const s of ['rejected', 'cancelled', 'revoked'] as const)
			expect(err('2026-11-03', '2026-11-09', own(s))).toBeNull();
		expect(err('2026-11-10', '2026-11-12', own('approved'))).toBeNull();
	});
});

describe('unlocks', () => {
	const hs: Holiday[] = [
		{ playerId: 'a', from: '2026-11-02', to: '2026-11-08', status: 'approved' }, // week 5
		{ playerId: 'b', from: '2026-11-09', to: '2026-11-15', status: 'revoked' }, // week 6
		{ playerId: 'c', from: '2026-11-09', to: '2026-11-15', status: 'pending' },
		{ playerId: 'd', from: '2026-11-09', to: '2026-11-15', status: 'rejected' }
	];
	const unlocked = unlockedWeeks(hs, cal.startDate);
	const s = { publishedRound: 8, roundsPerWeek: 2 };
	const m = (round: number, p1Id: string, p2Id: string, stage?: 'group' | 'playoff') => ({
		round,
		p1Id,
		p2Id,
		stage
	});

	it('unlocks only the holiday player’s matches in covered unpublished weeks', () => {
		expect(isUnlocked(m(9, 'a', 'x'), s, unlocked)).toBe(true);
		expect(isUnlocked(m(10, 'x', 'a'), s, unlocked)).toBe(true);
		expect(isUnlocked(m(9, 'x', 'y'), s, unlocked)).toBe(false);
		expect(isUnlocked(m(11, 'a', 'x'), s, unlocked)).toBe(false); // week 6 not covered
		expect(isUnlocked(m(7, 'a', 'x'), s, unlocked)).toBe(false); // already published
		expect(isUnlocked(m(9, 'a', 'x', 'playoff'), s, unlocked)).toBe(false);
	});
	it('a revoke keeps what was unlocked; pending and rejected unlock nothing', () => {
		expect(isUnlocked(m(11, 'b', 'x'), s, unlocked)).toBe(true);
		expect(isUnlocked(m(11, 'c', 'x'), s, unlocked)).toBe(false);
		expect(isUnlocked(m(11, 'd', 'x'), s, unlocked)).toBe(false);
	});
	it('the badge is for approved holidays only', () => {
		const away = awayWeeks(hs, cal.startDate);
		expect([...away.keys()]).toEqual(['a']);
		expect([...away.get('a')!]).toEqual([5]);
	});
	it('only the two players see an unlocked match; everyone sees published ones', () => {
		expect(visibleTo(m(9, 'a', 'x'), 'a', s, unlocked)).toBe(true);
		expect(visibleTo(m(9, 'a', 'x'), 'x', s, unlocked)).toBe(true);
		expect(visibleTo(m(9, 'a', 'x'), 'y', s, unlocked)).toBe(false);
		expect(visibleTo(m(9, 'a', 'x'), null, s, unlocked)).toBe(false);
		expect(visibleTo(m(9, 'x', 'y'), 'x', s, unlocked)).toBe(false);
		expect(visibleTo(m(8, 'x', 'y'), null, s, unlocked)).toBe(true);
	});
});
