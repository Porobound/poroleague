import { matchPoints } from './score';
import { standings, type Entry, type MatchResult } from './standings';

// A group match as the standings get it, plus what the stats read. `games` is one char per game
// played ('1', '2' or 'D'), or null when the match was reported as counts only.
export type StatMatch = MatchResult & {
	round: number;
	games?: string | null;
	diceWinnerId?: string | null;
};
export type Letter = 'W' | 'D' | 'L';

// How a Bo3 went, from the player's side. A 1–0 or 0–1 is a match called on time.
const SHAPES = [
	{ key: 'sweep', label: 'Won 2–0', scores: ['2-0'] },
	{ key: 'close-win', label: 'Won 2–1 or 1–0', scores: ['2-1', '1-0'] },
	{ key: 'draw', label: 'Drew', scores: ['1-1', '0-0'] },
	{ key: 'close-loss', label: 'Lost 1–2 or 0–1', scores: ['1-2', '0-1'] },
	{ key: 'swept', label: 'Lost 0–2', scores: ['0-2'] }
] as const;

const rate = (wins: number, played: number) => (played ? wins / played : null);

// One player's matches, oldest round first: form, runs, how the scores fell, and whether winning
// the dice roll went with winning the match.
// Takes what `standings()` takes (the group's entries, its matches and the deadline flag) and
// counts what it counts, so the totals equal the player's row there: a match with a dropped player
// is void and left out, and an unplayed match is left out until the deadline passes, then is a
// loss with no games. A dropped player has no row and no stats.
export function playerStats(
	entries: Entry[],
	matches: StatMatch[],
	playerId: string,
	deadlinePassed = false
) {
	const active = new Set(entries.filter((e) => !e.dropped).map((e) => e.playerId));
	const rows = matches
		.filter((m) => active.has(m.p1) && active.has(m.p2))
		.filter((m) => m.p1 === playerId || m.p2 === playerId)
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
								decider: false,
								unplayed: true
							}
						]
					: [];
			const first = m.p1 === playerId;
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
					dice: m.diceWinnerId == null ? null : m.diceWinnerId === playerId,
					// A drawn game is a game played: 1–1 over three games went to game 3. Without
					// the per-game record the score is all there is.
					decider: (m.games?.length ?? won + lost) === 3,
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
	const deciders = rows.filter((r) => r.decider);

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
				count: rows.filter((r) => r.unplayed).length
			}
		],
		// Matches that went to a third game.
		deciders: { played: deciders.length, wins: deciders.filter((r) => r.letter === 'W').length },
		dice: { with: split(true), without: split(false) }
	};
}
// The player's place in their group after each round with a counted match, replaying the standings
// round by round. Empty for a dropped player, who has no place. A round nobody has played yet has
// no standings of its own and is skipped; after the deadline every round counts, unplayed matches
// as double losses, so the last entry is the player's place in the standings.
// Organizer tie ranks order only the standings they were set on, so they apply to the last round
// alone. `tied` is what the standings mark: a place still waiting on an organizer, so it is set
// only on the last round and only once the deadline has passed. Earlier, level players are the
// normal state of a group, not a tie to settle.
export function rankByRound(
	entries: Entry[],
	matches: (MatchResult & { round: number })[],
	playerId: string,
	deadlinePassed = false
) {
	const counted = deadlinePassed
		? matches
		: matches.filter((m) => m.p1Games !== null && m.p2Games !== null);
	const active = new Set(entries.filter((e) => !e.dropped).map((e) => e.playerId));
	const rounds = [
		...new Set(counted.filter((m) => active.has(m.p1) && active.has(m.p2)).map((m) => m.round))
	].sort((a, b) => a - b);
	const unranked = entries.map((e) => ({ ...e, tiebreak: null }));
	const out: { round: number; rank: number; points: number; tied: boolean }[] = [];
	for (const round of rounds) {
		const last = round === rounds.at(-1);
		const rows = standings(
			last ? entries : unranked,
			counted.filter((m) => m.round <= round),
			deadlinePassed
		);
		const i = rows.findIndex((r) => r.playerId === playerId);
		if (i < 0) return [];
		out.push({
			round,
			rank: i + 1,
			points: rows[i].points,
			tied: last && deadlinePassed && rows[i].unresolvedTie
		});
	}
	return out;
}
