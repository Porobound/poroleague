import { describe, expect, it } from 'vitest';
import { date, day, ordinal, pct, tzName, when } from './format';

describe('ordinal', () => {
	it('handles the teens and the st/nd/rd endings', () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
			'1st',
			'2nd',
			'3rd',
			'4th',
			'11th',
			'12th',
			'13th',
			'21st',
			'22nd',
			'101st',
			'111th'
		]);
	});
});

describe('league dates', () => {
	it('formats dates, days and Helsinki times', () => {
		expect(date('2026-11-15')).toBe('15 Nov 2026');
		expect(date(null)).toBe('');
		expect(day('2026-11-08')).toBe('Sun 8 Nov');
		expect(pct(null)).toBe('—');
		expect(pct(0.666)).toBe('67%');
	});

	it('names the Helsinki zone on either side of DST', () => {
		expect(tzName('2026-07-01')).toBe('EEST');
		expect(tzName('2026-12-01')).toBe('EET');
		expect(when(new Date('2026-07-01T09:30:00Z'))).toMatch(/1 Jul.*12:30.*EEST/);
		expect(when(new Date('2026-12-01T09:30:00Z'))).toMatch(/1 Dec.*11:30.*EET/);
	});
});
