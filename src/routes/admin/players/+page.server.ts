import { organizerPage } from '#lib/server/auth.ts';
import { leaderboard } from '#lib/server/players.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await organizerPage(event);
	return { players: leaderboard() };
};
