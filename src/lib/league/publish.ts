import { roundsOfWeek, weekOf } from './time';

// The next publish covers from the round after the last published one to the end of its week.
export function nextPublish(publishedRound: number, roundsPerWeek: number, maxRound: number) {
	const first = publishedRound + 1;
	const week = weekOf(first, roundsPerWeek);
	const rounds = roundsOfWeek(week, roundsPerWeek, maxRound);
	return rounds && first <= maxRound
		? { week, rounds: [first, rounds[1]] as [number, number] }
		: null;
}

// Players only see matches of published rounds.
export const published = <T extends { round: number }>(ms: T[], publishedRound: number) =>
	ms.filter((m) => m.round <= publishedRound);
