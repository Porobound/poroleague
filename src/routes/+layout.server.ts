import { latestSeason, myPlayerPage } from '#lib/server/seasons.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, params }) => ({
	user: locals.user,
	myPage: locals.user ? myPlayerPage(locals.user.id, params.slug) : null,
	// Pages outside a season (archive, admin, login) still link to the latest public one.
	navSlug: params.slug ?? latestSeason('not-draft')?.slug
});
