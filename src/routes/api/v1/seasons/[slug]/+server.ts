import { json } from '@sveltejs/kit';
import { apiSeason, notFound, seasonDetail } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const season = apiSeason(params.slug);
	return season ? json(seasonDetail(season)) : notFound('Season not found');
};
