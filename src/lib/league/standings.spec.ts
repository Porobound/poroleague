import { describe, expect, it } from 'vitest';
import { standings, type Entry, type MatchResult } from './standings';

const entry = (playerId: string, extra: Partial<Entry> = {}): Entry => ({
	playerId,
	dropped: false,
	tiebreak: null,
	...extra
});
const m = (
	p1: string,
	p1Games: number | null,
	p2Games: number | null,
	p2: string
): MatchResult => ({
	p1,
	p2,
	p1Games,
	p2Games
});
const order = (rows: { playerId: string }[]) => rows.map((r) => r.playerId);

describe('standings', () => {
	it('tallies points, record and game-win %', () => {
		const rows = standings(
			['A', 'B', 'C'].map((id) => entry(id)),
			[m('A', 2, 0, 'B'), m('A', 2, 1, 'C'), m('B', 2, 0, 'C')]
		);
		expect(order(rows)).toEqual(['A', 'B', 'C']);
		expect(rows[0]).toMatchObject({ played: 2, wins: 2, points: 6, gameWins: 4, gameLosses: 1 });
		expect(rows[0].gwp).toBeCloseTo(0.8);
	});

	it('head-to-head beats game-win %', () => {
		// A and B on 6 pts, A has better GW%, but B beat A. C and D on 3 pts, D beat C.
		const rows = standings(
			['A', 'B', 'C', 'D'].map((id) => entry(id)),
			[
				m('B', 2, 1, 'A'),
				m('A', 2, 0, 'C'),
				m('A', 2, 0, 'D'),
				m('C', 2, 1, 'B'),
				m('B', 2, 1, 'D'),
				m('D', 2, 0, 'C')
			]
		);
		expect(order(rows)).toEqual(['B', 'A', 'D', 'C']);
	});

	it('three-way cycle falls through to game-win %', () => {
		// A beat B, B beat C, C beat A: all 3 pts, h2h all equal. GW%: A .6, C .5, B .4
		const rows = standings(
			['A', 'B', 'C'].map((id) => entry(id)),
			[m('A', 2, 0, 'B'), m('B', 2, 1, 'C'), m('C', 2, 1, 'A')]
		);
		expect(order(rows)).toEqual(['A', 'C', 'B']);
		expect(rows.some((r) => r.unresolvedTie)).toBe(false);
	});

	it('voids every match of a dropped player', () => {
		const rows = standings(
			[entry('A'), entry('B'), entry('C', { dropped: true })],
			[m('A', 2, 0, 'C'), m('B', 2, 0, 'C'), m('B', 2, 1, 'A')]
		);
		expect(order(rows)).toEqual(['B', 'A']);
		expect(rows[1]).toMatchObject({ played: 1, points: 0 });
	});

	it('flags unresolved ties, organizer tiebreak resolves them', () => {
		const draw = [m('A', 1, 1, 'B')];
		const tied = standings([entry('A'), entry('B')], draw);
		expect(tied.every((r) => r.unresolvedTie)).toBe(true);

		const ranked = standings([entry('A', { tiebreak: 2 }), entry('B', { tiebreak: 1 })], draw);
		expect(order(ranked)).toEqual(['B', 'A']);
		expect(ranked.some((r) => r.unresolvedTie)).toBe(false);
	});

	it('before any results, nobody is flagged as tied', () => {
		const rows = standings([entry('A'), entry('B'), entry('C')], [m('A', null, null, 'B')]);
		expect(rows.some((r) => r.unresolvedTie)).toBe(false);
	});

	it('unplayed match is a double loss only after the deadline', () => {
		const unplayed = [m('A', null, null, 'B')];
		expect(standings([entry('A'), entry('B')], unplayed)[0]).toMatchObject({
			played: 0,
			losses: 0
		});
		expect(standings([entry('A'), entry('B')], unplayed, true)[0]).toMatchObject({
			played: 1,
			losses: 1,
			points: 0
		});
	});
});
