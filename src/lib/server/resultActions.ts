import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { organizerEditEmbed, resultEmbed } from '#lib/discord.ts';
import { parseReport } from '#lib/league/report.ts';
import { organizerAction } from '#lib/server/auth.ts';
import {
	getMatch,
	isVoided,
	keepResult,
	matchPost,
	organizerEdit,
	resultOf
} from '#lib/server/matches.ts';
import { liveState } from '#lib/matchCard.ts';
import { getSeason } from '#lib/server/seasons.ts';
import { nextPlayed } from '#lib/server/topCut.ts';
import { postResult, postToOrganizers } from '#lib/server/webhooks.ts';

// Organizer result actions, shared by the Matches page and the season page's flagged cards.
type Event = RequestEvent<
	{ slug: string },
	'/seasons/[slug]/admin' | '/seasons/[slug]/admin/matches'
>;

// Reads the form first; callers write with no await after this, so two requests can't interleave.
async function target(event: Event) {
	const user = await organizerAction(event);
	const form = await event.request.formData();
	const season = getSeason(event.params.slug, user);
	const id = Number(form.get('matchId'));
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	if (!match) error(404, 'Match not found');
	return { user, form, season, match };
}

export async function editResult(event: Event) {
	const { user, form, season, match } = await target(event);
	if (!liveState(match, season).inPlay)
		return fail(409, {
			message: 'Results can only change while the season or its top cut is in play.'
		});
	if (isVoided(match)) return fail(409, { message: 'A player dropped, so this match is void.' });
	if (match.stage === 'group' && match.round > season.publishedRound)
		return fail(409, { message: 'Publish this week before entering results.' });
	if (match.stage === 'playoff' && nextPlayed(season, match))
		return fail(409, { message: 'The next match is already in; correct that one first.' });
	const parsed = parseReport(form, match.p1Id, match.p2Id);
	if (!parsed.ok) return fail(400, { message: Object.values(parsed.errors).join(' ') });
	const resolves = !!match.flaggedBy && !match.flagResolvedAt;
	organizerEdit(match, user.id, parsed.values);
	const post = matchPost(event.url.origin, season, match, parsed.values);
	if (!match.reportedBy) postResult(resultEmbed(post));
	else postToOrganizers(organizerEditEmbed(post, user.displayName, { resolves, kept: false }));
	return { message: resolves ? 'Result changed. Flag resolved.' : 'Result saved and logged.' };
}

export async function keepFlag(event: Event) {
	const { user, season, match } = await target(event);
	if (
		!liveState(match, season).inPlay ||
		!match.flaggedBy ||
		match.flagResolvedAt ||
		isVoided(match)
	)
		return fail(409, { message: 'This result has no open flag.' });
	keepResult(match, user.id);
	postToOrganizers(
		organizerEditEmbed(
			matchPost(event.url.origin, season, match, resultOf(match)!),
			user.displayName,
			{
				resolves: true,
				kept: true
			}
		)
	);
	return { message: 'Flag closed. Result kept as reported.' };
}
