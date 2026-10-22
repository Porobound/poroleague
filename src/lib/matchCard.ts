import { matchMode } from '#lib/league/report.ts';
import { isOverdue, isVoid } from '#lib/league/status.ts';
import { currentWeek, reportingClosed } from '#lib/league/time.ts';
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
};
type Person = { playerId: string; displayName: string; avatar: string | null; dropped: boolean };
type CardSeason = {
	slug: string;
	status: string;
	deadline: string | null;
	startDate: string | null;
	roundsPerWeek: number;
};
export type Status = 'scheduled' | 'reported' | 'flagged' | 'void' | 'overdue';

// Everything a page needs to turn matches into cards, built once per request.
export function cardContext(
	season: CardSeason,
	people: Person[],
	viewerId: string | null,
	now = new Date()
) {
	return {
		season,
		viewerId,
		people: new Map(people.map((p) => [p.playerId, p])),
		dropped: new Set(people.filter((p) => p.dropped).map((p) => p.playerId)),
		week: currentWeek(season.startDate, now),
		closed: reportingClosed(season.deadline, now)
	};
}
export type CardContext = ReturnType<typeof cardContext>;

export function matchCard(m: CardMatch, c: CardContext) {
	const voided = isVoid(m, c.dropped);
	const inPlay = c.season.status === 'play';
	const overdue = isOverdue(m, {
		roundsPerWeek: c.season.roundsPerWeek,
		week: c.week,
		inPlay,
		closed: c.closed,
		voided
	});
	const status: Status = voided
		? 'void'
		: m.flaggedBy
			? 'flagged'
			: m.reportedBy
				? 'reported'
				: overdue
					? 'overdue'
					: 'scheduled';
	const person = (id: string) => c.people.get(id);
	const side = (id: string, legend: string | null, games: number | null) => ({
		name: person(id)?.displayName ?? 'Unknown',
		avatar: person(id)?.avatar ?? null,
		legend,
		games,
		href: `/seasons/${c.season.slug}/players/${id}`
	});
	const mode = matchMode(m, {
		viewerId: c.viewerId,
		inPlay,
		closed: c.closed,
		voided
	});
	return {
		id: m.id,
		mine: m.p1Id === c.viewerId || m.p2Id === c.viewerId,
		status,
		props: {
			head: `${m.group ? `${groupName(m.group)} · ` : ''}Round ${m.round}`,
			sides: [side(m.p1Id, m.p1Legend, m.p1Games), side(m.p2Id, m.p2Legend, m.p2Games)] as [
				ReturnType<typeof side>,
				ReturnType<typeof side>
			],
			dice: (m.diceWinnerId === m.p1Id ? 0 : m.diceWinnerId === m.p2Id ? 1 : null) as 0 | 1 | null,
			status,
			note: voided
				? 'Void: a player dropped'
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
