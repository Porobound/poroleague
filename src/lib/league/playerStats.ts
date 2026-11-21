import { matchPoints } from './score';
import { standings, type Entry, type MatchResult } from './standings';

export type StatMatch = {
	round: number;
	p1Id: string;
	p2Id: string;
	p1Games: number;
	p2Games: number;
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

// One player's played matches, oldest round first: form, streaks, how the scores fell, and
// whether winning the dice roll went with winning the match. Pass only matches that count
// (played, not void).
export function playerStats(matches: StatMatch[], playerId: string) {
	const rows = matches
		.filter((m) => m.p1Id === playerId || m.p2Id === playerId)
		.sort((a, b) => a.round - b.round)
		.map((m) => {
			const first = m.p1Id === playerId;
			const won = first ? m.p1Games : m.p2Games;
			const lost = first ? m.p2Games : m.p1Games;
			const [points] = matchPoints(won, lost);
			return {
				round: m.round,
				won,
				lost,
				points,
				letter: (points === 3 ? 'W' : points === 1 ? 'D' : 'L') as Letter,
				// null: nobody recorded the roll.
				dice: m.diceWinnerId === null ? null : m.diceWinnerId === playerId
			};
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
		form: rows.map(({ round, letter, won, lost }) => ({ round, letter, won, lost })),
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
		shapes: SHAPES.map(({ scores, ...s }) => ({
			...s,
			count: rows.filter((r) => (scores as readonly string[]).includes(`${r.won}-${r.lost}`)).length
		})),
		// Matches that went to a third game.
		deciders: { played: deciders.length, wins: deciders.filter((r) => r.letter === 'W').length },
		dice: { with: split(true), without: split(false) }
	};
}
export type PlayerStats = ReturnType<typeof playerStats>;

// The player's place in their group after each round, replaying the standings round by round.
// Empty for a dropped player, who has no place.
export function rankByRound(
	entries: Entry[],
	matches: (MatchResult & { round: number })[],
	playerId: string
) {
	const played = matches.filter((m) => m.p1Games !== null && m.p2Games !== null);
	const last = Math.max(0, ...played.map((m) => m.round));
	const out: { round: number; rank: number; points: number }[] = [];
	for (let round = 1; round <= last; round++) {
		const rows = standings(
			entries,
			played.filter((m) => m.round <= round)
		);
		const i = rows.findIndex((r) => r.playerId === playerId);
		if (i < 0) return [];
		out.push({ round, rank: i + 1, points: rows[i].points });
	}
	return out;
}
