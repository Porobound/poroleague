import { json } from '@sveltejs/kit';
import { notFound, playerDetail } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	const player = playerDetail(params.id, url.origin);
	return player ? json(player) : notFound('Player not found');
};
