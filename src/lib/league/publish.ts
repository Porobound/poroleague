import { roundsOfWeek, weekOf } from '#lib/league/time.ts';

// The next publish covers from the round after the last published one to the end of its week.
export function nextPublish(publishedRound: number, roundsPerWeek: number, maxRound: number) {
	const first = publishedRound + 1;
	const week = weekOf(first, roundsPerWeek);
	const rounds = roundsOfWeek(week, roundsPerWeek, maxRound);
	return rounds && first <= maxRound
		? { week, rounds: [first, rounds[1]] as [number, number] }
		: null;
}

// The weeks published before they start; null while publishing keeps pace with the calendar.
export function weeksAhead(publishedRound: number, roundsPerWeek: number, week: number) {
	const last = weekOf(publishedRound, roundsPerWeek);
	return last > week ? ([week + 1, last] as [number, number]) : null;
}

// The one rule for whether a result counts anywhere public (standings, stats, Elo, audit, API,
// results webhook): its round is published. Holiday mode lets matches be reported before that.
// Top-cut matches are public once they exist.
export const isPublished = (m: { stage?: string | null; round: number }, publishedRound: number) =>
	m.stage === 'playoff' || m.round <= publishedRound;

const UNREPORTED = {
	p1Games: null,
	p2Games: null,
	games: null,
	p1Legend: null,
	p2Legend: null,
	diceWinnerId: null,
	reportedBy: null,
	reportedAt: null
};

// The public view of a match: an early (unpublished) result reads as never reported. Flags stay,
// so organizers (open flags, the end of the season) still see them; public views don't show flags.
export const masked = <T extends { stage?: string | null; round: number }>(
	m: T,
	publishedRound: number
): T => (isPublished(m, publishedRound) ? m : { ...m, ...UNREPORTED });

// Players only see matches of published rounds.
export const published = <T extends { stage?: string | null; round: number }>(
	ms: T[],
	publishedRound: number
) => ms.filter((m) => isPublished(m, publishedRound));
