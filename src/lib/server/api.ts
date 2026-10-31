// Public read-only API (`/api/v1`, docs/api.md): fixed shapes over the same data the public pages
// show, so a page redesign can't break a consumer. Avatars and Discord ids never leave here.
import { json } from '@sveltejs/kit';
import { groupName, hasSchedule } from '#lib/season.ts';
import {
	allSeasons,
	findSeason,
	groupStandings,
	seasonEntries,
	type Season
} from '#lib/server/seasons.ts';

export const notFound = (error: string) => json({ error }, { status: 404 });

// A season the public pages show: not a draft, not deleted.
export const apiSeason = (slug: string) => {
	const s = findSeason(slug);
	return s && s.status !== 'draft' ? s : null;
};

export const playerRef = (p: { playerId: string; displayName: string; former: boolean }) => ({
	id: p.playerId,
	name: p.displayName,
	former: p.former
});

const summary = (s: Season) => ({
	slug: s.slug,
	name: s.name,
	status: s.status,
	startDate: s.startDate,
	deadline: s.deadline
});

export const seasonList = () =>
	allSeasons()
		.filter((s) => s.status !== 'draft')
		.map(summary);

export function seasonDetail(s: Season) {
	const list = seasonEntries(s.id);
	// A draw isn't final until the groups are locked: organizers can still redraw.
	const locked = hasSchedule(s.status);
	return {
		...summary(s),
		roundsPerWeek: s.roundsPerWeek,
		publishedRound: s.publishedRound,
		topCutSize: s.topCutSize,
		topCutDate: s.topCutDate,
		players: list.map((e) => ({
			...playerRef(e),
			group: locked ? e.group : null,
			dropped: e.dropped
		})),
		groups: locked
			? groupStandings(s, list).map((g) => ({
					group: g.group,
					name: groupName(g.group),
					standings: g.rows.map((r, i) => ({
						rank: i + 1,
						player: playerRef({ playerId: r.playerId, displayName: r.name, former: r.former }),
						played: r.played,
						wins: r.wins,
						draws: r.draws,
						losses: r.losses,
						points: r.points,
						gameWins: r.gameWins,
						gameLosses: r.gameLosses,
						gameWinPct: r.gwp,
						unresolvedTie: r.unresolvedTie
					}))
				}))
			: []
	};
}
