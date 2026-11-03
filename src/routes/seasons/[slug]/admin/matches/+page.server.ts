import { isUnlocked } from '#lib/league/holiday.ts';
import { seasonUnlocks } from '#lib/server/holidays.ts';
import { adminRows, seasonMatches, type AdminRow } from '#lib/server/matches.ts';
import { editResult, keepFlag } from '#lib/server/resultActions.ts';
import { seasonEntries } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

const FILTERS = {
	all: () => true,
	unplayed: (r: AdminRow) => r.status === 'scheduled' || r.status === 'overdue',
	reported: (r: AdminRow) => r.status === 'reported',
	flagged: (r: AdminRow) => r.status === 'flagged',
	resolved: (r: AdminRow) => r.status === 'reported' && r.card.resolved,
	void: (r: AdminRow) => r.status === 'void'
};
type Filter = keyof typeof FILTERS;

export const load: PageServerLoad = async ({ parent, url }) => {
	const { season } = await parent();
	const f = url.searchParams.get('status') ?? '';
	const filter: Filter = Object.hasOwn(FILTERS, f) ? (f as Filter) : 'all';
	const all = seasonMatches(season.id);
	const rows = adminRows(season, seasonEntries(season.id), all).filter((r) => FILTERS[filter](r));
	const { unlocked } = seasonUnlocks(season);
	return {
		rows,
		filter,
		canEdit: season.status === 'play',
		publishedRound: season.publishedRound,
		// Unpublished matches a holiday unlocked: organizers can enter and edit their results.
		unlocked: all.filter((m) => isUnlocked(m, season, unlocked)).map((m) => m.id)
	};
};

export const actions: Actions = { edit: editResult, keep: keepFlag };
