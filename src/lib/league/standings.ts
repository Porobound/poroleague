import { matchPoints } from './score';

export type Entry = { playerId: string; dropped: boolean; tiebreak: number | null };
export type MatchResult = {
	p1: string;
	p2: string;
	p1Games: number | null;
	p2Games: number | null;
};
export type Row = {
	playerId: string;
	played: number;
	wins: number;
	draws: number;
	losses: number;
	points: number;
	gameWins: number;
	gameLosses: number;
	gwp: number;
	unresolvedTie: boolean;
	tie: string | null; // tied run's key, ignoring organizer ranks
};

const played = (m: MatchResult): m is MatchResult & { p1Games: number; p2Games: number } =>
	m.p1Games !== null && m.p2Games !== null;

export function standings(entries: Entry[], matches: MatchResult[], deadlinePassed = false): Row[] {
	const active = new Map(entries.filter((e) => !e.dropped).map((e) => [e.playerId, e]));
	const counted = matches.filter((m) => active.has(m.p1) && active.has(m.p2));
	const rows = new Map<string, Row>();
	for (const id of active.keys()) {
		rows.set(id, {
			playerId: id,
			played: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			points: 0,
			gameWins: 0,
			gameLosses: 0,
			gwp: 0,
			unresolvedTie: false,
			tie: null
		});
	}

	for (const m of counted) {
		const a = rows.get(m.p1)!;
		const b = rows.get(m.p2)!;
		if (!played(m)) {
			if (deadlinePassed) for (const r of [a, b]) tally(r, 0, 0, 0);
			continue;
		}
		const [pa, pb] = matchPoints(m.p1Games, m.p2Games);
		tally(a, pa, m.p1Games, m.p2Games);
		tally(b, pb, m.p2Games, m.p1Games);
	}
	for (const r of rows.values()) {
		const games = r.gameWins + r.gameLosses;
		r.gwp = games ? r.gameWins / games : 0;
	}

	const byPoints = [...rows.values()].sort((x, y) => y.points - x.points);
	const result: Row[] = [];
	for (let i = 0; i < byPoints.length;) {
		let j = i;
		while (j < byPoints.length && byPoints[j].points === byPoints[i].points) j++;
		result.push(...breakTie(byPoints.slice(i, j), counted, active, deadlinePassed));
		i = j;
	}
	return result;
}

function tally(r: Row, points: number, won: number, lost: number) {
	r.played++;
	r.points += points;
	r.gameWins += won;
	r.gameLosses += lost;
	if (points === 3) r.wins++;
	else if (points === 1) r.draws++;
	else r.losses++;
}

// ponytail: single-pass mini-league; a still-tied subset isn't re-run through h2h. Recurse if that ever matters.
function breakTie(
	tied: Row[],
	matches: MatchResult[],
	entries: Map<string, Entry>,
	deadlinePassed: boolean
): Row[] {
	if (tied.length === 1) return tied;
	const ids = new Set(tied.map((r) => r.playerId));
	const among = matches.filter((m) => ids.has(m.p1) && ids.has(m.p2));
	const h2h = new Map(tied.map((r) => [r.playerId, 0]));
	// Head-to-head counts only once every tied pair has met; until then it rewards an early draw.
	const met = among.filter((m) => played(m) || deadlinePassed).length;
	if (met === (tied.length * (tied.length - 1)) / 2)
		for (const m of among) {
			if (!played(m)) continue;
			const [pa, pb] = matchPoints(m.p1Games, m.p2Games);
			h2h.set(m.p1, h2h.get(m.p1)! + pa);
			h2h.set(m.p2, h2h.get(m.p2)! + pb);
		}
	const rank = (r: Row) => entries.get(r.playerId)!.tiebreak ?? Number.MAX_SAFE_INTEGER;
	const base = (x: Row, y: Row) =>
		+!x.played - +!y.played ||
		h2h.get(y.playerId)! - h2h.get(x.playerId)! ||
		y.gwp - x.gwp;
	const cmp = (x: Row, y: Row) => base(x, y) || rank(x) - rank(y);

	const sorted = [...tied].sort(cmp);
	for (let i = 0; i < sorted.length - 1; i++) {
		const [x, y] = [sorted[i], sorted[i + 1]];
		if (x.played === 0 || y.played === 0 || base(x, y) !== 0) continue;
		y.tie = x.tie ??= x.playerId;
		// A missing rank means nobody ordered this tie.
		const unranked = (r: Row) => entries.get(r.playerId)!.tiebreak === null;
		if (unranked(x) || unranked(y) || rank(x) === rank(y)) x.unresolvedTie = y.unresolvedTie = true;
	}
	return sorted;
}
