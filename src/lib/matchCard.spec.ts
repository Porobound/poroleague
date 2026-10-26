import { describe, expect, it } from 'vitest';
import { cardContext, matchCard, type CardMatch } from '#lib/matchCard.ts';

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
	roundsPerWeek: 2
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
	p2Games: 1,
	p1Legend: 'Jinx',
	p2Legend: 'Viktor',
	diceWinnerId: 'p2',
	reportedBy: 'p1'
};

describe('matchCard status', () => {
	it('ranks void over flagged over reported over overdue over scheduled', () => {
		const status = (m: Partial<CardMatch>) => matchCard(match(m), ctx()).status;
		expect(status({ p2Id: 'p3', ...reported, flaggedBy: 'p2' })).toBe('void');
		expect(status({ ...reported, round: 1, flaggedBy: 'p2' })).toBe('flagged');
		expect(status({ ...reported, flaggedBy: 'p2', flagResolvedAt: NOW })).toBe('reported');
		expect(status({ ...reported, round: 1 })).toBe('reported');
		expect(status({ round: 4 })).toBe('overdue');
		expect(status({ round: 5 })).toBe('scheduled');
	});

	it('marks a resolved flag', () => {
		const resolved = (m: Partial<CardMatch>) => matchCard(match(m), ctx()).props.resolved;
		expect(resolved({ ...reported, flaggedBy: 'p2', flagResolvedAt: NOW })).toBe(true);
		expect(resolved({ ...reported, flaggedBy: 'p2' })).toBe(false);
		expect(resolved(reported)).toBe(false);
	});

	it('is never overdue outside play or after the deadline', () => {
		const status = (s: typeof season) => matchCard(match({ round: 1 }), ctx(null, s)).status;
		expect(status({ ...season, status: 'finished' })).toBe('scheduled');
		expect(status({ ...season, deadline: '2026-10-01' })).toBe('scheduled');
	});
});

describe('matchCard props', () => {
	it('builds the card for a reported match', () => {
		const card = matchCard(match(reported), ctx('p2'));
		expect(card.mine).toBe(true);
		expect(card.props).toMatchObject({
			head: 'Group A · Round 5',
			dice: 1,
			note: 'Reported by Player 1',
			link: { href: '/seasons/s1/matches/7', label: 'View' },
			sides: [
				{ name: 'Player 1', legend: 'Jinx', games: 2, href: '/seasons/s1/players/p1' },
				{ name: 'Player 2', legend: 'Viktor', games: 1 }
			]
		});
	});

	it('offers Report to a player in the match only', () => {
		expect(matchCard(match(), ctx('p1')).props.link.label).toBe('Report');
		const other = matchCard(match(), ctx('p3'));
		expect([other.mine, other.props.link.label]).toEqual([false, 'View']);
		expect(matchCard(match(), ctx()).props.link.label).toBe('View');
	});

	it('marks a former player and drops their link', () => {
		const c = cardContext(
			season,
			[...people.slice(1), { ...people[0], displayName: 'Former player 1', former: true }],
			null,
			NOW
		);
		const [p1, p2] = matchCard(match(), c).props.sides;
		expect(p1).toMatchObject({ name: 'Former player 1', former: true, href: null });
		expect(p2).toMatchObject({ former: false, href: '/seasons/s1/players/p2' });
	});

	it('handles playoffs, unknown people and void notes', () => {
		const card = matchCard(
			match({ group: null, p2Id: 'gone', reportedBy: 'org', diceWinnerId: 'x' }),
			ctx()
		);
		expect(card.props).toMatchObject({
			head: 'Round 5',
			dice: null,
			note: 'Reported by an organizer'
		});
		expect(card.props.sides[1]).toMatchObject({ name: 'Unknown', avatar: null });
		expect(matchCard(match({ p2Id: 'p3' }), ctx()).props.note).toBe('Void: a player dropped');
	});
});

describe('playoff cards', () => {
	it('labels playoff matches and keeps them open after the league deadline', () => {
		const season = {
			slug: 's',
			status: 'topcut',
			deadline: '2026-01-01',
			startDate: '2025-12-01',
			roundsPerWeek: 2
		};
		const people = ['p1', 'p2'].map((id) => ({
			playerId: id,
			displayName: id,
			avatar: null,
			dropped: false,
			former: false
		}));
		const base = {
			id: 1,
			group: null,
			round: 2,
			slot: 1,
			stage: 'playoff' as const,
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
			walkoverId: null
		};
		const ctx = cardContext(season, people, 'p1', new Date('2026-06-01'), 3);
		const card = matchCard(base, ctx);
		expect(card.props.head).toBe('Semifinal 2');
		expect(card.status).toBe('scheduled');
		expect(card.props.link.label).toBe('Report');
		const wo = matchCard({ ...base, walkoverId: 'p2' }, ctx);
		expect(wo.props.note).toBe('Walkover · p2 advances');
		expect(wo.props.link.label).toBe('View');
	});
});
