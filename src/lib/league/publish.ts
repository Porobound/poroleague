import { weekOf } from './time';

// The next publish covers from the round after the last published one to the end of its week.
export function nextPublish(publishedRound: number, roundsPerWeek: number, maxRound: number) {
	const first = publishedRound + 1;
	if (first > maxRound) return null;
	const week = weekOf(first, roundsPerWeek);
	return { week, rounds: [first, Math.min(week * roundsPerWeek, maxRound)] as [number, number] };
}

// Players only see matches of published rounds.
export const published = <T extends { round: number }>(ms: T[], publishedRound: number) =>
	ms.filter((m) => m.round <= publishedRound);
