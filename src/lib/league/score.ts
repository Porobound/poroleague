const VALID = new Set(['2-0', '2-1', '1-0', '1-1', '0-0', '0-1', '0-2', '1-2']);

export function isValidScore(a: number, b: number): boolean {
	return VALID.has(`${a}-${b}`);
}

export function matchPoints(a: number, b: number): [number, number] {
	return a > b ? [3, 0] : a < b ? [0, 3] : [1, 1];
}

// One char per game played: '1' or '2' (who won it) or 'D'. `game` is the 0-based row to mark.
export type GamesScore =
	{ ok: true; games: string; p1: number; p2: number } | { ok: false; error: string; game: number };

// Games 2 and 3 are optional (time can run out), with no gaps and nothing after a player has 2 wins.
export function scoreGames(picks: string[]): GamesScore {
	const won = { '1': 0, '2': 0, D: 0 };
	let games = '';
	for (const [i, g] of picks.entries()) {
		if (!g) {
			if (i === 0) return { ok: false, error: 'Pick the result of game 1.', game: 0 };
			const next = picks.findIndex((x, j) => j > i && x);
			if (next > 0)
				return {
					ok: false,
					error: `Game ${next + 1} can't be played without game ${i + 1}.`,
					game: next
				};
			break;
		}
		if (!Object.hasOwn(won, g))
			return { ok: false, error: "That isn't a possible Bo3 result.", game: i };
		if (won['1'] === 2 || won['2'] === 2)
			return {
				ok: false,
				error: `Game ${i + 1} can't be played: the match was already 2–0.`,
				game: i
			};
		won[g as keyof typeof won]++;
		games += g;
	}
	if (!isValidScore(won['1'], won['2']))
		return { ok: false, error: "That isn't a possible Bo3 result.", game: 0 };
	return { ok: true, games, p1: won['1'], p2: won['2'] };
}
