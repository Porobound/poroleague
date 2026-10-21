import { fail } from '@sveltejs/kit';
import { organizerAction } from '#lib/server/auth.ts';
import { getSeason, removeEntry, seasonEntries } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	return { entries: seasonEntries(season.id) };
};

export const actions: Actions = {
	remove: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup')
			return fail(409, { message: 'Players can only be removed while signup is open.' });
		const playerId = String((await event.request.formData()).get('playerId'));
		removeEntry(season.id, playerId);
		return { message: 'Removed from signups.' };
	}
};
