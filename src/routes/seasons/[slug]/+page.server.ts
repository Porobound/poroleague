import { error, fail } from '@sveltejs/kit';
import { currentRole, playerAction } from '#lib/server/auth.ts';
import { playerMatches } from '#lib/server/matches.ts';
import {
	addEntry,
	getSeason,
	groupStandings,
	removeEntry,
	seasonEntries
} from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { params, locals } = event;
	const season = getSeason(params.slug, locals.user);
	// getSeason only trusts the session flag; drafts also need the role re-checked with Discord.
	if (season.status === 'draft' && !(await currentRole(event))) error(404, 'Season not found');
	const list = seasonEntries(season.id);
	return {
		season,
		entries: list,
		groups:
			season.status === 'play' || season.status === 'finished' ? groupStandings(season, list) : [],
		signedUp: !!locals.user && list.some((e) => e.playerId === locals.user!.id),
		myMatches:
			locals.user && (season.status === 'play' || season.status === 'finished')
				? playerMatches(season.id, locals.user.id)
				: []
	};
};

export const actions: Actions = {
	join: async (event) => {
		const user = playerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup') return fail(409, { message: 'Signup is closed.' });
		addEntry(season.id, user.id);
		return { message: "You're in. See you in the groups." };
	},

	withdraw: async (event) => {
		const user = playerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup')
			return fail(409, {
				message: 'Signup is closed, so you can no longer withdraw. Ask an organizer.'
			});
		removeEntry(season.id, user.id);
		return { message: `You withdrew from ${season.name}.` };
	}
};
