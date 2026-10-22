import { describe, expect, it } from 'vitest';
import { matchMode, parseReport, resultLine, type ModeContext } from './report';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const valid = { p1Games: '2', p2Games: '1', p1Legend: 'Jinx', p2Legend: 'Ahri', dice: 'a' };

describe('parseReport', () => {
	it('parses a valid report', () => {
		expect(parseReport(form(valid), 'a', 'b')).toEqual({
			ok: true,
			values: { p1Games: 2, p2Games: 1, p1Legend: 'Jinx', p2Legend: 'Ahri', diceWinnerId: 'a' }
		});
	});

	it('accepts a 1-1 draw', () => {
		expect(parseReport(form({ ...valid, p1Games: '1', p2Games: '1' }), 'a', 'b').ok).toBe(true);
	});

	it('rejects scores that are not a finished Bo3, and missing scores', () => {
		for (const [p1Games, p2Games] of [
			['2', '2'],
			['0', '0'],
			['1', '0'],
			['3', '0'],
			['', '2']
		]) {
			const r = parseReport(form({ ...valid, p1Games, p2Games }), 'a', 'b');
			expect(r.ok ? null : r.errors).toEqual({
				score: 'That is not a finished Bo3. Check the numbers.'
			});
		}
	});

	it('requires listed legends and a dice winner who played the match', () => {
		const r = parseReport(
			form({ ...valid, p1Legend: 'Not A Legend', p2Legend: '', dice: 'c' }),
			'a',
			'b'
		);
		expect(Object.keys(r.ok ? {} : r.errors).sort()).toEqual(['dice', 'p1Legend', 'p2Legend']);
	});
});

describe('matchMode', () => {
	const unreported = { p1Id: 'a', p2Id: 'b', reportedBy: null, flaggedBy: null };
	const byA = { ...unreported, reportedBy: 'a' };
	const ctx = (o: Partial<ModeContext> = {}): ModeContext => ({
		viewerId: 'a',
		inPlay: true,
		closed: false,
		voided: false,
		...o
	});

	it('lets either player report an unreported match', () => {
		expect(matchMode(unreported, ctx())).toBe('report');
		expect(matchMode(unreported, ctx({ viewerId: 'b' }))).toBe('report');
	});

	it('is read-only for visitors, other players, void matches and seasons not in play', () => {
		expect(matchMode(unreported, ctx({ viewerId: null }))).toBe('view');
		expect(matchMode(unreported, ctx({ viewerId: 'c' }))).toBe('view');
		expect(matchMode(unreported, ctx({ voided: true }))).toBe('view');
		expect(matchMode(byA, ctx({ voided: true, viewerId: 'b' }))).toBe('view');
		expect(matchMode(unreported, ctx({ inPlay: false }))).toBe('view');
	});

	it('lets the reporter edit and the opponent flag', () => {
		expect(matchMode(byA, ctx())).toBe('edit');
		expect(matchMode(byA, ctx({ viewerId: 'b' }))).toBe('flag');
	});

	it('locks the result for both players once flagged', () => {
		const flagged = { ...byA, flaggedBy: 'b' };
		expect(matchMode(flagged, ctx())).toBe('locked');
		expect(matchMode(flagged, ctx({ viewerId: 'b' }))).toBe('locked');
	});

	it('closes reporting and editing at the deadline, but not flagging', () => {
		expect(matchMode(unreported, ctx({ closed: true }))).toBe('view');
		expect(matchMode(byA, ctx({ closed: true }))).toBe('view');
		expect(matchMode(byA, ctx({ closed: true, viewerId: 'b' }))).toBe('flag');
	});
});

describe('resultLine', () => {
	it('reads like the spec example', () => {
		const r = { p1Games: 2, p2Games: 1, p1Legend: 'Jinx', p2Legend: 'Ahri', diceWinnerId: 'a' };
		expect(resultLine({ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, r)).toBe(
			'Alice 2-1 Bob (Jinx vs Ahri, Alice won the roll)'
		);
	});
});
