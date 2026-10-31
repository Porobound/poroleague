import { json } from '@sveltejs/kit';
import { apiSeason, notFound, seasonMatchList } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const season = apiSeason(params.slug);
	return season ? json(seasonMatchList(season)) : notFound('Season not found');
};
