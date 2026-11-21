import { matchPoints } from './score';
import { standings, type Entry, type MatchResult } from './standings';

export type StatMatch = {
	round: number;
	p1Id: string;
	p2Id: string;
	p1Games: number | null;
	p2Games: number | null;
	diceWinnerId: string | null;
};
export type Letter = 'W' | 'D' | 'L';

// How a Bo3 went, from the player's side. A 1–0 or 0–1 is a match called on time.
const SHAPES = [
	{ key: 'sweep', label: 'Won 2–0', letter: 'W', scores: ['2-0'] },
	{ key: 'close-win', label: 'Won 2–1 or 1–0', letter: 'W', scores: ['2-1', '1-0'] },
	{ key: 'draw', label: 'Drew', letter: 'D', scores: ['1-1', '0-0'] },
	{ key: 'close-loss', label: 'Lost 1–2 or 0–1', letter: 'L', scores: ['1-2', '0-1'] },
	{ key: 'swept', label: 'Lost 0–2', letter: 'L', scores: ['0-2'] }
] as const;

const rate = (wins: number, played: number) => (played ? wins / played : null);

// One player's matches, oldest round first: form, runs, how the scores fell, and whether winning
// the dice roll went with winning the match. Pass only matches that count (not void).
// Unplayed matches are left out until the deadline passes; after it they are losses with no games,
// as in the standings, so the totals here always equal the W–D–L shown beside them.
export function playerStats(matches: StatMatch[], playerId: string, deadlinePassed = false) {
	const rows = matches
		.filter((m) => m.p1Id === playerId || m.p2Id === playerId)
		.sort((a, b) => a.round - b.round)
		.flatMap((m) => {
			if (m.p1Games === null || m.p2Games === null)
				return deadlinePassed
					? [
							{
								round: m.round,
								won: 0,
								lost: 0,
								letter: 'L' as Letter,
								dice: null,
								unplayed: true
							}
						]
					: [];
			const first = m.p1Id === playerId;
			const won = first ? m.p1Games : m.p2Games;
			const lost = first ? m.p2Games : m.p1Games;
			const [points] = matchPoints(won, lost);
			return [
				{
					round: m.round,
					won,
					lost,
					letter: (points === 3 ? 'W' : points === 1 ? 'D' : 'L') as Letter,
					// null: nobody recorded the roll.
					dice: m.diceWinnerId === null ? null : m.diceWinnerId === playerId,
					unplayed: false
				}
			];
		});
	const count = (l: Letter) => rows.filter((r) => r.letter === l).length;

	let bestWins = 0;
	let run = 0;
	for (const r of rows) {
		run = r.letter === 'W' ? run + 1 : 0;
		bestWins = Math.max(bestWins, run);
	}
	const last = rows.at(-1);
	const tail = last ? rows.length - 1 - rows.findLastIndex((r) => r.letter !== last.letter) : 0;

	const split = (dice: boolean) => {
		const of = rows.filter((r) => r.dice === dice);
		return { played: of.length, wins: of.filter((r) => r.letter === 'W').length };
	};
	const deciders = rows.filter((r) => r.won + r.lost === 3);

	return {
		played: rows.length,
		form: rows.map(({ round, letter, won, lost, unplayed }) => ({
			round,
			letter,
			won,
			lost,
			unplayed
		})),
		wins: count('W'),
		draws: count('D'),
		losses: count('L'),
		winRate: rate(count('W'), rows.length),
		games: {
			won: rows.reduce((n, r) => n + r.won, 0),
			lost: rows.reduce((n, r) => n + r.lost, 0)
		},
		streak: last ? { letter: last.letter, length: tail } : null,
		bestWins,
		shapes: [
			...SHAPES.map(({ scores, ...s }) => ({
				...s,
				count: rows.filter(
					(r) => !r.unplayed && (scores as readonly string[]).includes(`${r.won}-${r.lost}`)
				).length
			})),
			{
				key: 'unplayed' as const,
				label: 'Not played',
				letter: 'L' as const,
				count: rows.filter((r) => r.unplayed).length
			}
		],
		// Matches that went to a third game.
		deciders: { played: deciders.length, wins: deciders.filter((r) => r.letter === 'W').length },
		dice: { with: split(true), without: split(false) }
	};
}
export type PlayerStats = ReturnType<typeof playerStats>;

// The player's place in their group after each round, replaying the standings round by round.
// `tied` is a place the tiebreakers have not settled. Empty for a dropped player, who has no place.
// After the deadline every round counts, unplayed matches as double losses, so the last entry is
// the player's place in the standings.
export function rankByRound(
	entries: Entry[],
	matches: (MatchResult & { round: number })[],
	playerId: string,
	deadlinePassed = false
) {
	const counted = deadlinePassed
		? matches
		: matches.filter((m) => m.p1Games !== null && m.p2Games !== null);
	const last = Math.max(0, ...counted.map((m) => m.round));
	const out: { round: number; rank: number; points: number; tied: boolean }[] = [];
	for (let round = 1; round <= last; round++) {
		const rows = standings(
			entries,
			counted.filter((m) => m.round <= round),
			deadlinePassed
		);
		const i = rows.findIndex((r) => r.playerId === playerId);
		if (i < 0) return [];
		out.push({ round, rank: i + 1, points: rows[i].points, tied: rows[i].unresolvedTie });
	}
	return out;
}
