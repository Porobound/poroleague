import {
	gameWinPct,
	legendMatches,
	legendPlayers,
	legendStats,
	matchWinPct,
	type Tally
} from '#lib/league/legendStats.ts';
import { currentWeek, weekOf } from '#lib/league/time.ts';
import { LEGENDS } from '#lib/legends.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import { publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

// Each column's first direction when you click it.
const FIRST = { legend: 'asc', picks: 'desc', players: 'desc', w: 'desc', mw: 'desc', gw: 'desc' };
type Key = keyof typeof FIRST;
const VALUE: Record<Exclude<Key, 'legend'>, (t: Tally) => number | null> = {
	picks: (t) => t.picks,
	players: (t) => t.players.size,
	w: (t) => t.wins,
	mw: (t) => matchWinPct(t),
	gw: (t) => gameWinPct(t)
};

export const load: PageServerLoad = ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	const list = seasonEntries(season.id);
	const people = new Map(list.map((e) => [e.playerId, e]));
	const dropped = new Set(list.filter((e) => e.dropped).map((e) => e.playerId));
	const all = seasonMatches(season.id);
	const ms = legendMatches(all, dropped);

	const asked = url.searchParams.get('sort') ?? '';
	const sort: Key = asked in FIRST ? (asked as Key) : 'picks';
	const askedDir = url.searchParams.get('dir');
	const dir = askedDir === 'asc' || askedDir === 'desc' ? askedDir : FIRST[sort];
	// Unrated legends (win % hidden) sort last either way; ties fall back to picks.
	const rows = legendStats(ms).sort((a, b) => {
		let c: number;
		if (sort === 'legend') c = a.key.localeCompare(b.key);
		else {
			const [x, y] = [VALUE[sort](a), VALUE[sort](b)];
			if (x === null || y === null) return x === y ? b.picks - a.picks : x === null ? 1 : -1;
			c = x - y;
		}
		return (dir === 'asc' ? c : -c) || b.picks - a.picks;
	});

	const open = url.searchParams.get('legend');
	const week = currentWeek(season.startDate, new Date());
	const weeks = weekOf(Math.max(0, ...all.map((m) => m.round)), season.roundsPerWeek);

	return {
		season,
		sort,
		dir,
		open,
		week: season.status === 'play' && week >= 1 && week <= weeks ? { week, weeks } : null,
		matches: ms.length,
		maxPicks: Math.max(1, ...rows.map((r) => r.picks)),
		rows,
		users: open
			? legendPlayers(ms, open).map((t) => ({
					...t,
					name: people.get(t.key)?.displayName ?? 'Unknown',
					avatar: people.get(t.key)?.avatar ?? null,
					former: !!people.get(t.key)?.former
				}))
			: [],
		notPicked: LEGENDS.filter((l) => !rows.some((r) => r.key === l))
	};
};
