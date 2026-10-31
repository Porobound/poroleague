import { json } from '@sveltejs/kit';
import { apiSeason, legendList, notFound } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const season = apiSeason(params.slug);
	return season ? json(legendList(season)) : notFound('Season not found');
};
