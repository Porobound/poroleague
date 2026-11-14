import { error } from '@sveltejs/kit';
import { isPublished } from '#lib/league/publish.ts';
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
		match &&
		side &&
		canSeeReplays(
			match,
			locals.user?.id ?? null,
			organizer,
			!isPublished(match, season.publishedRound)
		)
			? replayGzip(match.id, game, sideOf(match, side))
			: undefined;
	if (!file || !match || !side) error(404, 'Replay not found');
	const by = matchPlayers(match)[side - 1].displayName;
	// Sent gzipped as stored; the browser saves the plain JSON.
	return new Response(new Uint8Array(file), {
		headers: {
			'content-type': 'application/json',
			'content-encoding': 'gzip',
			'content-disposition': `attachment; filename="${replayFileName(season.slug, id, game, side, by)}"`,
			'cache-control': 'private, no-store'
		}
	});
};
