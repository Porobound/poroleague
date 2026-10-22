import { organizerPage } from '#lib/server/auth.ts';
import { getSeason } from '#lib/server/seasons.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	await organizerPage(event);
	return { season: getSeason(event.params.slug, event.locals.user) };
};
