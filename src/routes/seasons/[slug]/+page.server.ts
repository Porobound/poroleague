import { fail } from '@sveltejs/kit';
import { playerAction } from '#lib/server/auth.ts';
import { addEntry, getSeason, groupsOf, removeEntry, seasonEntries } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const season = getSeason(params.slug, locals.user);
	const list = seasonEntries(season.id);
	return {
		season,
		entries: list,
		groups: season.status === 'play' || season.status === 'finished' ? groupsOf(list) : [],
		signedUp: !!locals.user && list.some((e) => e.playerId === locals.user!.id)
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
