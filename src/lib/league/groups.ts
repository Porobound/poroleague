export const MAX_GROUPS = 8;
export const MAX_PLAYERS = 128;
export const DEFAULT_GROUP_SIZE = 16;

// Most players a season can take with groups of `groupSize`.
export const maxPlayersFor = (groupSize: number) => Math.min(MAX_PLAYERS, MAX_GROUPS * groupSize);

// Fewest groups of at most groupSize; splitGroups keeps them within one player of each other.
export function defaultGroupCount(players: number, groupSize = DEFAULT_GROUP_SIZE): number {
	return Math.max(1, Math.ceil(players / groupSize));
}

export function groupPlan(players: number, groupSize: number) {
	const count = defaultGroupCount(players, groupSize);
	return { count, min: Math.floor(players / count), max: Math.ceil(players / count) };
}

export function splitGroups<T>(items: T[], groupCount: number, random = Math.random): T[][] {
	const shuffled = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return Array.from({ length: groupCount }, (_, g) =>
		shuffled.filter((_, i) => i % groupCount === g)
	);
}
