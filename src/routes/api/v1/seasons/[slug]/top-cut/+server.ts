import { json } from '@sveltejs/kit';
import { apiSeason, notFound, topCut } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const season = apiSeason(params.slug);
	if (!season) return notFound('Season not found');
	const cut = topCut(season);
	return cut ? json(cut) : notFound('No top cut yet');
};
