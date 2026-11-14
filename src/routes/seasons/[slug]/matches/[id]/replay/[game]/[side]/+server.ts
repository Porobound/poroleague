import { error } from '@sveltejs/kit';
import { currentRole } from '#lib/server/auth.ts';
import { getMatch, matchPlayers } from '#lib/server/matches.ts';
import { canSeeReplays, replayFileName, replayGzip, sideOf } from '#lib/server/replays.ts';
import { getSeason } from '#lib/server/seasons.ts';
import type { RequestHandler } from './$types';

// The replay file as RiftAtlas wrote it, as a download: the one the match's player `side` (1 or 2)
// added for the game. Whoever may not see it gets the same 404 as for a replay that isn't there.
export const GET: RequestHandler = async (event) => {
	const { params, locals } = event;
	const organizer = !!locals.user?.isOrganizer && (await currentRole(event));
	const season = getSeason(params.slug, locals.user);
	const [id, game] = [Number(params.id), Number(params.game)];
	const side = params.side === '1' ? 1 : params.side === '2' ? 2 : null;
	const match = Number.isInteger(id) && side ? getMatch(season.id, id) : undefined;
	const file =
		match && side && canSeeReplays(match, season.publishedRound, locals.user?.id ?? null, organizer)
			? replayGzip(match.id, game, sideOf(match, side))
			: undefined;
	if (!file || !match || !side) error(404, 'Replay not found');
	const [p1, p2] = matchPlayers(match);
	const name = replayFileName(season.slug, id, game, side, [p1.displayName, p2.displayName]);
	// Sent gzipped as stored; the browser saves the plain JSON.
	return new Response(new Uint8Array(file), {
		headers: {
			'content-type': 'application/json',
			'content-encoding': 'gzip',
			'content-disposition': `attachment; filename="${name}"`,
			'cache-control': 'private, no-store'
		}
	});
};
