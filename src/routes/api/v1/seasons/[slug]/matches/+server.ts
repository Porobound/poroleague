import { json } from '@sveltejs/kit';
import { apiSeason, notFound, seasonMatchList } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	const season = apiSeason(params.slug);
	return season ? json(seasonMatchList(season, url.origin)) : notFound('Season not found');
};
