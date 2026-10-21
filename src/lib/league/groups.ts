export function defaultGroupCount(players: number): number {
	return players >= 16 ? 2 : 1;
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
