import { error } from '@sveltejs/kit';
import { currentRole } from '#lib/server/auth.ts';
import { getMatch } from '#lib/server/matches.ts';
import { canSeeReplays, replayFile } from '#lib/server/replays.ts';
import { getSeason } from '#lib/server/seasons.ts';
import type { RequestHandler } from './$types';

// The replay file as RiftAtlas wrote it, as a download. Whoever may not see it gets the same 404
// as for a replay that isn't there.
export const GET: RequestHandler = async (event) => {
	const { params, locals } = event;
	const organizer = !!locals.user?.isOrganizer && (await currentRole(event));
	const season = getSeason(params.slug, locals.user);
	const [id, game] = [Number(params.id), Number(params.game)];
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	const file =
		match && canSeeReplays(match, locals.user?.id ?? null, organizer)
			? replayFile(match.id, game)
			: undefined;
	if (!file) error(404, 'Replay not found');
	return new Response(file, {
		headers: {
			'content-type': 'application/json',
			'content-disposition': `attachment; filename="poroleague-${season.slug}-match-${id}-game-${game}.json"`,
			'cache-control': 'private, no-store'
		}
	});
};
