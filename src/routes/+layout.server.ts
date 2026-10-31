import { latestSeason, myPlayerPage } from '#lib/server/seasons.ts';
import { cutPublished } from '#lib/server/topCut.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, locals, params }) => {
	// Pages outside a season (archive, admin, login) still link to the latest public one.
	const navSlug = params.slug ?? latestSeason('not-draft')?.slug;
	return {
		user: locals.user,
		theme: cookies.get('theme') === 'light' ? ('light' as const) : ('dark' as const),
		myPage: locals.user ? myPlayerPage(locals.user.id, params.slug) : null,
		navSlug,
		navCut: !!navSlug && cutPublished(navSlug)
	};
};
