export const GROUP_SIZE = 16;
export const MAX_PLAYERS = 8 * GROUP_SIZE;

// Fewest groups of at most GROUP_SIZE; splitGroups keeps them within one player of each other.
export function defaultGroupCount(players: number): number {
	return Math.max(1, Math.ceil(players / GROUP_SIZE));
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
