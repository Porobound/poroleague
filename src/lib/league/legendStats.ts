import { matchPoints } from './score';
import { isVoid } from './status';

export type LegendMatch = {
	p1Id: string;
	p2Id: string;
	p1Games: number;
	p2Games: number;
	p1Legend: string;
	p2Legend: string;
};
type Maybe = { [K in keyof LegendMatch]: LegendMatch[K] | null };

export type Tally = {
	key: string;
	players: Set<string>;
	picks: number;
	mirrors: number;
	wins: number;
	draws: number;
	losses: number;
	gameWins: number;
	gameLosses: number;
};

// Legend stats leave out void matches (a player dropped) and unplayed ones, which covers deadline
// double losses.
export const legendMatches = <M extends Maybe>(ms: M[], dropped: Set<string>) =>
	ms.filter(
		(m): m is M & LegendMatch =>
			m.p1Games !== null &&
			m.p2Games !== null &&
			!!m.p1Legend &&
			!!m.p2Legend &&
			!isVoid({ p1Id: m.p1Id!, p2Id: m.p2Id! }, dropped)
	);

type Side = { playerId: string; legend: string; vs: string; won: number; lost: number };
const sides = (ms: LegendMatch[]): Side[] =>
	ms.flatMap((m) => [
		{ playerId: m.p1Id, legend: m.p1Legend, vs: m.p2Legend, won: m.p1Games, lost: m.p2Games },
		{ playerId: m.p2Id, legend: m.p2Legend, vs: m.p1Legend, won: m.p2Games, lost: m.p1Games }
	]);

// In legend-wide stats a mirror is a pick, never a result (its win and loss cancel out).
// For one player's record it's a real result.
function group(list: Side[], key: (s: Side) => string, mirrorsCount = false): Tally[] {
	const rows = new Map<string, Tally>();
	for (const s of list) {
		const k = key(s);
		let t = rows.get(k);
		if (!t) {
			t = {
				key: k,
				players: new Set(),
				picks: 0,
				mirrors: 0,
				wins: 0,
				draws: 0,
				losses: 0,
				gameWins: 0,
				gameLosses: 0
			};
			rows.set(k, t);
		}
		t.players.add(s.playerId);
		t.picks++;
		if (s.legend === s.vs) {
			t.mirrors++;
			if (!mirrorsCount) continue;
		}
		const [points] = matchPoints(s.won, s.lost);
		if (points === 3) t.wins++;
		else if (points === 1) t.draws++;
		else t.losses++;
		t.gameWins += s.won;
		t.gameLosses += s.lost;
	}
	return [...rows.values()].sort((a, b) => b.picks - a.picks || a.key.localeCompare(b.key));
}

export const legendStats = (ms: LegendMatch[]) => group(sides(ms), (s) => s.legend);

export const legendPlayers = (ms: LegendMatch[], legend: string) =>
	group(
		sides(ms).filter((s) => s.legend === legend),
		(s) => s.playerId
	);

export function playerLegends(ms: LegendMatch[], playerId: string) {
	const mine = sides(ms).filter((s) => s.playerId === playerId);
	return {
		playedAs: group(mine, (s) => s.legend, true),
		against: group(mine, (s) => s.vs, true)
	};
}

export const MIN_RATED = 5;
export const results = (t: Tally) => t.wins + t.draws + t.losses;

// null = not enough non-mirror matches to show a rate.
export const matchWinPct = (t: Tally, min = MIN_RATED) =>
	results(t) >= Math.max(min, 1) ? t.wins / results(t) : null;
export const gameWinPct = (t: Tally, min = MIN_RATED) =>
	results(t) >= Math.max(min, 1) ? t.gameWins / (t.gameWins + t.gameLosses) : null;
