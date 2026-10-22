import type { Status } from '#lib/matchCard.ts';
import { adminRows, seasonMatches } from '#lib/server/matches.ts';
import { editResult, keepFlag } from '#lib/server/resultActions.ts';
import { seasonEntries } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

const FILTERS = {
	all: () => true,
	unplayed: (s: Status) => s === 'scheduled' || s === 'overdue',
	reported: (s: Status) => s === 'reported',
	flagged: (s: Status) => s === 'flagged',
	void: (s: Status) => s === 'void'
};
type Filter = keyof typeof FILTERS;

export const load: PageServerLoad = async ({ parent, url }) => {
	const { season } = await parent();
	const f = url.searchParams.get('status') ?? '';
	const filter: Filter = Object.hasOwn(FILTERS, f) ? (f as Filter) : 'all';
	const rows = adminRows(season, seasonEntries(season.id), seasonMatches(season.id)).filter((r) =>
		FILTERS[filter](r.status)
	);
	return { rows, filter, canEdit: season.status === 'play' };
};

export const actions: Actions = { edit: editResult, keep: keepFlag };
