import { roundRobin } from './roundRobin';

export type ScheduledMatch = { group: number; round: number; p1: string; p2: string };

export function buildSchedule(groups: string[][]): ScheduledMatch[] {
	return groups.flatMap((players, g) =>
		roundRobin(players).flatMap((pairs, r) =>
			pairs.map(([p1, p2]) => ({ group: g + 1, round: r + 1, p1, p2 }))
		)
	);
}
