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

// The one rule for whether a result counts anywhere public (standings, stats, Elo, audit, API,
// results webhook): its round is published. Holiday mode lets matches be reported before that.
// Top-cut matches are public once they exist. SQL twin: publishedMatch() in schema.ts.
export const isPublished = (m: { stage?: string; round: number }, publishedRound: number) =>
	m.stage === 'playoff' || m.round <= publishedRound;

// Players only see matches of published rounds.
export const published = <T extends { stage?: string; round: number }>(
	ms: T[],
	publishedRound: number
) => ms.filter((m) => isPublished(m, publishedRound));
