// Public read-only API (`/api/v1`, docs/api.md): fixed shapes over the same data the public pages
// show, so a page redesign can't break a consumer. Avatars and Discord ids never leave here.
import { json } from '@sveltejs/kit';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { groupName, hasSchedule } from '#lib/season.ts';
import { db } from '#lib/server/db/index.ts';
import { seasons } from '#lib/server/db/schema.ts';
import { allSeasons, groupStandings, seasonEntries, type Season } from '#lib/server/seasons.ts';

export const notFound = (error: string) => json({ error }, { status: 404 });

// A season the public pages show: not a draft, not deleted.
export const apiSeason = (slug: string) =>
	db
		.select()
		.from(seasons)
		.where(and(eq(seasons.slug, slug), ne(seasons.status, 'draft'), isNull(seasons.deletedAt)))
		.get() ?? null;

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
	return {
		...summary(s),
		roundsPerWeek: s.roundsPerWeek,
		publishedRound: s.publishedRound,
		topCutSize: s.topCutSize,
		topCutDate: s.topCutDate,
		players: list.map((e) => ({ ...playerRef(e), group: e.group, dropped: e.dropped })),
		groups: hasSchedule(s.status)
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
