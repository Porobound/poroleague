import {
	gameWinPct,
	legendMatches,
	legendPlayers,
	legendStats,
	matchWinPct,
	type Tally
} from '#lib/league/legendStats.ts';
import { LEGENDS } from '#lib/legends.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import { publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

// Unrated legends (under 5 matches) sort below every rated one.
const SORTS: Record<string, (t: Tally) => number> = {
	picks: (t) => t.picks,
	players: (t) => t.players.size,
	mw: (t) => matchWinPct(t) ?? -1,
	gw: (t) => gameWinPct(t) ?? -1
};

export const load: PageServerLoad = ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	const list = seasonEntries(season.id);
	const names = new Map(list.map((e) => [e.playerId, e.displayName]));
	const dropped = new Set(list.filter((e) => e.dropped).map((e) => e.playerId));
	const ms = legendMatches(seasonMatches(season.id), dropped);
	const rows = legendStats(ms);
	const sort = url.searchParams.get('sort') ?? 'picks';
	if (sort === 'legend') rows.sort((a, b) => a.key.localeCompare(b.key));
	else if (SORTS[sort]) rows.sort((a, b) => SORTS[sort](b) - SORTS[sort](a) || b.picks - a.picks);
	const open = url.searchParams.get('legend');

	return {
		season,
		sort,
		open,
		matches: ms.length,
		rows,
		users: open
			? legendPlayers(ms, open).map((t) => ({ ...t, name: names.get(t.key) ?? 'Unknown' }))
			: [],
		notPicked: LEGENDS.filter((l) => !rows.some((r) => r.key === l))
	};
};
