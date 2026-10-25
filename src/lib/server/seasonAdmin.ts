import { droppedIds, isVoid } from '#lib/league/status.ts';
import { nextPublish } from '#lib/league/publish.ts';
import { reportingClosed } from '#lib/league/time.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import { groupStandings, seasonEntries, type Season } from '#lib/server/seasons.ts';

// One read of the season's entries and matches, shared by every helper below.
export const seasonData = (seasonId: number) => {
	const list = seasonEntries(seasonId);
	const all = seasonMatches(seasonId);
	const dropped = droppedIds(list);
	return { list, all, live: all.filter((m) => !isVoid(m, dropped)) };
};
export type SeasonData = ReturnType<typeof seasonData>;

// The next week to publish and its non-void matches by round; null once everything is out.
// Allowed after the deadline too, so organizers can still publish a late week and enter its results.
export function nextPairings(season: Season, { all, live }: SeasonData) {
	const next = nextPublish(
		season.publishedRound,
		season.roundsPerWeek,
		Math.max(0, ...all.map((m) => m.round))
	);
	if (!next) return null;
	const [first, last] = next.rounds;
	const byRound = Array.from({ length: last - first + 1 }, (_, i) => first + i)
		.map((round) => ({
			round,
			pairs: live
				.filter((m) => m.round === round)
				.map((m) => ({ group: m.group, p1Id: m.p1Id, p2Id: m.p2Id }))
		}))
		.filter((r) => r.pairs.length);
	return { ...next, byRound, count: byRound.reduce((n, r) => n + r.pairs.length, 0) };
}

// End of season opens at the deadline, or earlier once every live match is reported.
export function endState(season: Season, { list, all, live }: SeasonData, now = new Date()) {
	const closed = reportingClosed(season.deadline, now);
	const unplayed = live.filter((m) => !m.reportedBy).length;
	const openFlags = live.filter((m) => m.flaggedBy && !m.flagResolvedAt).length;
	const ending = closed || unplayed === 0;
	type Tie = {
		group: number;
		resolved: boolean;
		players: {
			playerId: string;
			name: string;
			avatar: string | null;
			former: boolean;
			place: number;
		}[];
		points: number;
		gwp: number;
		h2h: string;
	};
	// Equal head-to-head between two players means they drew or never played.
	const h2h = (ids: string[]) => {
		if (ids.length > 2) return 'level';
		const m = live.find((m) => ids.includes(m.p1Id) && ids.includes(m.p2Id));
		return m?.reportedBy ? `drew ${m.p1Games}–${m.p2Games}` : 'not played';
	};
	const ties = ending
		? groupStandings(season, list, all).flatMap((g) => {
				const byKey = new Map<string, Tie>();
				g.rows.forEach((r, i) => {
					if (!r.tie) return;
					const t = byKey.get(r.tie) ?? {
						group: g.group,
						resolved: true,
						players: [],
						points: r.points,
						gwp: r.gwp,
						h2h: ''
					};
					t.players.push({
						playerId: r.playerId,
						name: r.name,
						avatar: r.avatar,
						former: r.former,
						place: i + 1
					});
					if (r.unresolvedTie) t.resolved = false;
					byKey.set(r.tie, t);
				});
				const ties = [...byKey.values()];
				for (const t of ties) t.h2h = h2h(t.players.map((p) => p.playerId));
				return ties;
			})
		: [];
	const ready = ending && !openFlags && ties.every((t) => t.resolved);
	return { closed, unplayed, openFlags, ending, ties, ready };
}
