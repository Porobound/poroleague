export type Pairing = [string, string];

// Circle method: first slot fixed, the rest rotate. Odd counts get a null bye slot.
export function roundRobin(players: string[]): Pairing[][] {
	if (players.length < 2) return [];
	const slots: (string | null)[] = players.length % 2 ? [...players, null] : [...players];
	const n = slots.length;
	const rounds: Pairing[][] = [];
	for (let r = 0; r < n - 1; r++) {
		const round: Pairing[] = [];
		for (let i = 0; i < n / 2; i++) {
			const a = slots[i];
			const b = slots[n - 1 - i];
			if (a !== null && b !== null) round.push([a, b]);
		}
		rounds.push(round);
		slots.splice(1, 0, slots.pop()!);
	}
	return rounds;
}
