import { describe, expect, it } from 'vitest';
import { cardContext, matchCard, type CardMatch } from '#lib/matchCard.ts';
import { povRow, vsRow } from '#lib/matchRow.ts';

const people = ['p1', 'p2', 'p3'].map((id, i) => ({
	playerId: id,
	displayName: `Player ${i + 1}`,
	avatar: null,
	dropped: id === 'p3',
	former: false
}));
const season: Parameters<typeof cardContext>[0] = {
	slug: 's1',
	status: 'play',
	deadline: null,
	startDate: '2026-10-05',
	roundsPerWeek: 2,
	publishedRound: 99
};
// Week 3 of the season: rounds 1–4 are from earlier weeks.
const NOW = new Date('2026-10-20T12:00:00Z');
const ctx = (viewerId: string | null = null, s = season) => cardContext(s, people, viewerId, NOW);
const match = (m: Partial<CardMatch> = {}): CardMatch => ({
	id: 7,
	group: 1,
	round: 5,
	p1Id: 'p1',
	p2Id: 'p2',
	p1Games: null,
	p2Games: null,
	p1Legend: null,
	p2Legend: null,
	diceWinnerId: null,
	reportedBy: null,
	flaggedBy: null,
	flagResolvedAt: null,
	...m
});
const reported = {
	p1Games: 2,
	p2Games: 0,
	p1Legend: 'Jinx',
	p2Legend: 'Viktor',
	diceWinnerId: 'p2',
	reportedBy: 'p1'
};
const playoff = { stage: 'playoff' as const, group: null, round: 2, slot: 1 };
const card = (m: Partial<CardMatch> = {}, c = ctx()) => matchCard(match(m), c);
// Holiday mode: round 3 (week 2) is not published yet.
const holiday = () => ({
	...ctx(null, { ...season, publishedRound: 2 }),
	away: new Map([['p2', new Set([2])]]),
	revoked: new Map([['p1', new Set([2])]])
});

describe('vsRow', () => {
	it('reported: score, winner and loser, legends, dice on the roller', () => {
		expect(vsRow(card(reported, ctx('p2')))).toEqual({
			id: 7,
			href: '/seasons/s1/matches/7',
			mine: true,
			void: false,
			sides: [
				{
					name: 'Player 1',
					avatar: null,
					former: false,
					legend: 'Jinx',
					tag: null,
					you: false,
					dice: false,
					result: 'won'
				},
				{
					name: 'Player 2',
					avatar: null,
					former: false,
					legend: 'Viktor',
					tag: null,
					you: true,
					dice: true,
					result: 'lost'
				}
			],
			score: [2, 0],
			mid: null,
			note: null,
			warn: false,
			chips: []
		});
	});

	it('draw: score with no winner', () => {
		const r = vsRow(card({ ...reported, p1Games: 1, p2Games: 1 }));
		expect(r.score).toEqual([1, 1]);
		expect(r.sides.map((s) => s.result)).toEqual([null, null]);
	});

	it('scheduled: no legends, mid "vs"', () => {
		const r = vsRow(card());
		expect([r.mid, r.score, r.mine]).toEqual(['vs', null, false]);
		expect(r.sides.map((s) => [s.legend, s.dice, s.result])).toEqual([
			[null, false, null],
			[null, false, null]
		]);
	});

	it('own open match: mid "Report"', () => {
		const r = vsRow(card({}, ctx('p1')));
		expect([r.mid, r.mine]).toEqual(['Report', true]);
		expect(r.sides.map((s) => s.you)).toEqual([true, false]);
	});

	it('flagged renders as reported', () => {
		const flagged = card({ ...reported, flaggedBy: 'p2' });
		expect(flagged.status).toBe('flagged');
		expect(vsRow(flagged)).toEqual(vsRow(card(reported)));
	});

	it('void: mid "Void", void true', () => {
		const r = vsRow(card({ p2Id: 'p3', ...reported }));
		expect([r.mid, r.void, r.score]).toEqual(['Void', true, null]);
		expect(r.sides.map((s) => s.legend)).toEqual([null, null]);
	});

	it('overdue: note "Week 1"', () => {
		const r = vsRow(card({ round: 1 }));
		expect([r.note, r.warn, r.mid]).toEqual(['Week 1', true, 'vs']);
	});

	it('holiday: On holiday stays on the side, Holiday revoked becomes a chip', () => {
		const r = vsRow(card({ round: 3 }, holiday()));
		expect(r.sides.map((s) => s.tag)).toEqual([null, 'On holiday']);
		expect(r.chips).toEqual(['Holiday revoked']);
	});

	it('early match gets the Early chip', () => {
		const c = ctx('p1', { ...season, publishedRound: 4 });
		expect(vsRow(card({ round: 5 }, c)).chips).toEqual(['Early']);
		expect(vsRow(card({ round: 5, ...reported }, c)).chips).toEqual(['Early']);
		expect(vsRow(card({ round: 4 }, c)).chips).toEqual([]);
	});

	it('walkover: mid "W/O", note "<name> advances"', () => {
		const c = cardContext({ ...season, status: 'topcut' }, people, 'p1', NOW, 3);
		const r = vsRow(card({ ...playoff, walkoverId: 'p2' }, c));
		expect([r.mid, r.note, r.warn, r.score]).toEqual(['W/O', 'Player 2 advances', false, null]);
		expect(r.chips).toEqual([]);
	});
});

describe('povRow', () => {
	it('reads from the given player: W 2–0 for p1, L 0–2 for p2', () => {
		const c = card(reported);
		expect(povRow(c, 'p1')).toEqual({
			id: 7,
			href: '/seasons/s1/matches/7',
			void: false,
			round: 5,
			opponent: { name: 'Player 2', avatar: null, former: false, legend: 'Viktor', tag: null },
			legend: 'Jinx',
			dice: false,
			overdue: false,
			score: [2, 0],
			letter: 'W',
			text: null,
			chips: []
		});
		expect(povRow(c, 'p2')).toMatchObject({
			opponent: { name: 'Player 1', legend: 'Jinx' },
			legend: 'Viktor',
			dice: true,
			score: [0, 2],
			letter: 'L'
		});
	});

	it('draw gives D', () => {
		expect(povRow(card({ ...reported, p1Games: 1, p2Games: 1 }), 'p2').letter).toBe('D');
	});

	it('unplayed: text "Report" for the viewer, "Week N" for others', () => {
		expect(povRow(card({}, ctx('p1')), 'p1')).toMatchObject({
			text: 'Report',
			score: null,
			letter: null,
			legend: null
		});
		expect(povRow(card(), 'p1').text).toBe('Week 3');
		const late = povRow(card({ round: 1 }), 'p2');
		expect([late.text, late.overdue]).toEqual(['Week 1', true]);
	});

	it('void gives text "Void"', () => {
		const r = povRow(card({ p2Id: 'p3', ...reported }), 'p1');
		expect([r.text, r.void, r.score, r.legend]).toEqual(['Void', true, null, null]);
	});

	it('playoff match carries its short bracket name as the round', () => {
		const c = cardContext({ ...season, status: 'topcut' }, people, null, NOW, 3);
		expect(povRow(card(playoff, c), 'p2')).toMatchObject({ round: 'SF 2', text: null });
		expect(povRow(card({ ...playoff, walkoverId: 'p2' }, c), 'p1').text).toBe('Walkover');
	});

	it('holiday: the opponent keeps On holiday, the chip carries Holiday revoked', () => {
		const c = card({ round: 3 }, holiday());
		expect([povRow(c, 'p1').opponent.tag, povRow(c, 'p2').opponent.tag]).toEqual([
			'On holiday',
			null
		]);
		expect(povRow(c, 'p2').chips).toEqual(['Holiday revoked']);
	});
});
