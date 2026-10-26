import { matchMode } from '#lib/league/report.ts';
import { droppedIds, isOverdue, isVoid } from '#lib/league/status.ts';
import { currentWeek, reportingClosed } from '#lib/league/time.ts';
import { matchName } from '#lib/league/bracket.ts';
import { groupName } from '#lib/season.ts';

export type CardMatch = {
	id: number;
	group: number | null;
	round: number;
	p1Id: string;
	p2Id: string;
	p1Games: number | null;
	p2Games: number | null;
	p1Legend: string | null;
	p2Legend: string | null;
	diceWinnerId: string | null;
	reportedBy: string | null;
	flaggedBy: string | null;
	flagResolvedAt: Date | null;
	stage?: 'group' | 'playoff';
	slot?: number | null;
	walkoverId?: string | null;
};
type Person = {
	playerId: string;
	displayName: string;
	avatar: string | null;
	dropped: boolean;
	former: boolean;
};
type CardSeason = {
	slug: string;
	status: string;
	deadline: string | null;
	startDate: string | null;
	roundsPerWeek: number;
};
export type Status = 'scheduled' | 'reported' | 'flagged' | 'void' | 'overdue';

// Playoff matches report while the top cut runs; the league deadline doesn't apply to them.
export const liveState = (
	m: { stage?: string },
	season: { status: string; deadline: string | null },
	now = new Date()
) =>
	m.stage === 'playoff'
		? { inPlay: season.status === 'topcut', closed: false }
		: { inPlay: season.status === 'play', closed: reportingClosed(season.deadline, now) };

// Everything a page needs to turn matches into cards, built once per request.
export function cardContext(
	season: CardSeason,
	people: Person[],
	viewerId: string | null,
	now = new Date(),
	cutRounds = 0
) {
	return {
		season,
		viewerId,
		now,
		cutRounds,
		people: new Map(people.map((p) => [p.playerId, p])),
		dropped: droppedIds(people),
		week: currentWeek(season.startDate, now),
		closed: reportingClosed(season.deadline, now)
	};
}
export type CardContext = ReturnType<typeof cardContext>;

export function matchCard(m: CardMatch, c: CardContext) {
	const { inPlay, closed } = liveState(m, c.season, c.now);
	const voided = isVoid(m, c.dropped);
	const walkover = m.walkoverId ? (c.people.get(m.walkoverId)?.displayName ?? 'Unknown') : null;
	const overdue = isOverdue(m, {
		roundsPerWeek: c.season.roundsPerWeek,
		week: c.week,
		inPlay: m.stage === 'playoff' ? false : inPlay,
		closed,
		voided
	});
	const status: Status = voided
		? 'void'
		: m.flaggedBy && !m.flagResolvedAt
			? 'flagged'
			: m.reportedBy || walkover
				? 'reported'
				: overdue
					? 'overdue'
					: 'scheduled';
	const person = (id: string) => c.people.get(id);
	const side = (id: string, legend: string | null, games: number | null) => ({
		name: person(id)?.displayName ?? 'Unknown',
		avatar: person(id)?.avatar ?? null,
		former: !!person(id)?.former,
		legend,
		games,
		href: person(id)?.former ? null : `/seasons/${c.season.slug}/players/${id}`
	});
	const mode = matchMode(m, {
		viewerId: c.viewerId,
		inPlay,
		closed,
		voided: voided || !!walkover
	});
	return {
		id: m.id,
		mine: m.p1Id === c.viewerId || m.p2Id === c.viewerId,
		status,
		props: {
			head:
				m.stage === 'playoff'
					? matchName(m.round, m.slot ?? 0, c.cutRounds)
					: `${m.group ? `${groupName(m.group)} · ` : ''}Round ${m.round}`,
			sides: [side(m.p1Id, m.p1Legend, m.p1Games), side(m.p2Id, m.p2Legend, m.p2Games)] as [
				ReturnType<typeof side>,
				ReturnType<typeof side>
			],
			dice: (m.diceWinnerId === m.p1Id ? 0 : m.diceWinnerId === m.p2Id ? 1 : null) as 0 | 1 | null,
			status,
			resolved: !!m.flagResolvedAt,
			note: voided
				? 'Void: a player dropped'
				: walkover
					? `Walkover · ${walkover} advances`
					: m.reportedBy
						? `Reported by ${person(m.reportedBy)?.displayName ?? 'an organizer'}`
						: '',
			link: {
				href: `/seasons/${c.season.slug}/matches/${m.id}`,
				label: mode === 'report' ? 'Report' : 'View'
			}
		}
	};
}
export type Card = ReturnType<typeof matchCard>;
