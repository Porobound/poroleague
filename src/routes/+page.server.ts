import { redirect } from '@sveltejs/kit';
import { latestSeason } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const live = latestSeason('not-draft');
	if (live && live.status !== 'finished') redirect(307, `/seasons/${live.slug}`);
	if (latestSeason('draft')) return { comingSoon: true };
	if (live) redirect(307, `/seasons/${live.slug}`);
	return { comingSoon: false };
};
