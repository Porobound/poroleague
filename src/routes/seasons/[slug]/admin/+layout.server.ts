import { organizerPage } from '#lib/server/auth.ts';
import { getSeason } from '#lib/server/seasons.ts';
import { cutRounds } from '#lib/server/topCut.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	await organizerPage(event);
	const season = getSeason(event.params.slug, event.locals.user);
	return { season, hasCut: cutRounds(season.id) > 0 };
};
