import { describe, expect, it } from 'vitest';
import {
	addDays,
	currentWeek,
	lastRoundDay,
	leagueDate,
	reportingClosed,
	roundsOfWeek,
	weekOf
} from './time';

describe('leagueDate', () => {
	it('gives the calendar date in Helsinki', () => {
		expect(leagueDate(new Date('2026-12-20T21:59:00Z'))).toBe('2026-12-20');
		expect(leagueDate(new Date('2026-12-20T22:00:00Z'))).toBe('2026-12-21');
	});
});

describe('reportingClosed', () => {
	it('closes after 23:59 Helsinki time on the deadline date (winter, UTC+2)', () => {
		expect(reportingClosed('2026-12-20', new Date('2026-12-20T21:59:59Z'))).toBe(false);
		expect(reportingClosed('2026-12-20', new Date('2026-12-20T22:00:00Z'))).toBe(true);
	});

	it('follows summer time (UTC+3)', () => {
		expect(reportingClosed('2026-06-10', new Date('2026-06-10T20:59:59Z'))).toBe(false);
		expect(reportingClosed('2026-06-10', new Date('2026-06-10T21:00:00Z'))).toBe(true);
	});

	it('stays open when no deadline is set', () => {
		expect(reportingClosed(null, new Date())).toBe(false);
	});
});

describe('weeks', () => {
	it('groups rounds into weeks', () => {
		expect([1, 2, 3, 4, 5].map((r) => weekOf(r, 2))).toEqual([1, 1, 2, 2, 3]);
	});
	it('counts weeks from the start date in league time', () => {
		expect(currentWeek('2026-11-02', new Date('2026-11-01T12:00:00Z'))).toBe(0);
		expect(currentWeek('2026-11-02', new Date('2026-11-01T22:30:00Z'))).toBe(1); // 00:30 Helsinki
		expect(currentWeek('2026-11-02', new Date('2026-11-08T12:00:00Z'))).toBe(1);
		expect(currentWeek('2026-11-02', new Date('2026-11-09T12:00:00Z'))).toBe(2);
		expect(currentWeek(null, new Date())).toBe(0);
	});
});

describe('roundsOfWeek', () => {
	it("gives the week's rounds, capped at the last round", () => {
		expect(roundsOfWeek(1, 2, 11)).toEqual([1, 2]);
		expect(roundsOfWeek(6, 2, 11)).toEqual([11, 11]);
		expect(roundsOfWeek(7, 2, 11)).toBeNull();
		expect(roundsOfWeek(0, 2, 11)).toBeNull();
	});
});

describe('addDays', () => {
	it('steps whole calendar days across DST and month ends', () => {
		expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-01-07', -7)).toBe('2025-12-31');
	});
});

describe('lastRoundDay', () => {
	it('is the last day of the week holding the final round', () => {
		// 16 players: 15 rounds at 2 a week fill 8 weeks, so the 56th day.
		expect(lastRoundDay('2026-11-02', 2, 15)).toBe('2026-12-27');
		expect(lastRoundDay('2026-11-02', 2, 14)).toBe('2026-12-20');
		expect(lastRoundDay('2026-11-02', 1, 1)).toBe('2026-11-08');
	});
});
