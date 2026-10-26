import { error, fail } from '@sveltejs/kit';
import { LEGENDS } from '#lib/legends.ts';
import { flagEmbed, resultEmbed } from '#lib/discord.ts';
import { matchMode, parseReport } from '#lib/league/report.ts';
import { playerAction } from '#lib/server/auth.ts';
import {
	flagMatch,
	getMatch,
	isVoided,
	lastLegend,
	matchPlayers,
	matchPost,
	resultOf,
	saveReport
} from '#lib/server/matches.ts';
import { cardContext, liveState, matchCard } from '#lib/matchCard.ts';
import { getSeason, seasonEntries } from '#lib/server/seasons.ts';
import { cutRounds, nextPlayed, waitingOnFlag } from '#lib/server/topCut.ts';
import { postResult, postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

type Event = { params: { slug: string; id: string }; locals: App.Locals };

// Everything an action checks, read in one go. Actions call it after awaiting the form, with no
// await between this and the write, so two requests can't interleave.
function context({ params, locals }: Event) {
	const season = getSeason(params.slug, locals.user);
	const id = Number(params.id);
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	// Unpublished pairings stay secret, organizers included; they have Admin → Matches.
	if (!match || (match.stage === 'group' && match.round > season.publishedRound))
		error(404, 'Match not found');
	const { inPlay, closed } = liveState(match, season);
	const voided = isVoided(match);
	let mode = matchMode(match, {
		viewerId: locals.user?.id ?? null,
		inPlay,
		closed,
		voided: voided || !!match.walkoverId
	});
	// Top cut: a flag must be settled before the next match is played, so fixes can still move the
	// bracket. Reporting waits on a flagged feeder; flagging closes once the next match is in.
	const playoff = match.stage === 'playoff';
	const waiting = playoff && mode === 'report' && waitingOnFlag(season, match);
	const settled = playoff && mode === 'flag' && nextPlayed(season, match);
	if (waiting || settled) mode = 'view';
	return { season, match, mode, closed, voided, waiting, settled };
}

export const load: PageServerLoad = (event) => {
	const { season, match, mode, closed, voided, waiting, settled } = context(event);
	const [p1, p2] = matchPlayers(match);
	const viewer = event.locals.user?.id ?? null;
	const card = matchCard(
		match,
		cardContext(season, seasonEntries(season.id), viewer, new Date(), cutRounds(season.id))
	);
	return {
		season,
		match,
		// Same status rule as every match card.
		status: card.status,
		head: card.props.head,
		mode,
		closed,
		voided,
		waiting,
		settled,
		walkover: match.walkoverId
			? [p1, p2].find((p) => p.id === match.walkoverId)!.displayName
			: null,
		p1,
		p2,
		legends: LEGENDS,
		prefill: {
			p1Legend: match.p1Legend ?? lastLegend(match.p1Id) ?? '',
			p2Legend: match.p2Legend ?? lastLegend(match.p2Id) ?? ''
		}
	};
};

export const actions: Actions = {
	report: async (event) => {
		const user = playerAction(event);
		const form = await event.request.formData();
		const { season, match, mode } = context(event);
		if (mode !== 'report')
			return fail(409, { error: true, message: 'This match is already reported or closed.' });
		const parsed = parseReport(form, match.p1Id, match.p2Id);
		if (!parsed.ok)
			return fail(400, {
				errors: parsed.errors,
				values: Object.fromEntries(form) as Record<string, string>
			});
		saveReport(match, user.id, parsed.values);
		const post = matchPost(event.url.origin, season, match, parsed.values);
		postResult(resultEmbed(post));
		const opponent = user.id === post.p1.id ? post.p2 : post.p1;
		return { message: `Result saved. If something's off, you or ${opponent.name} can flag it.` };
	},

	flag: async (event) => {
		const user = playerAction(event);
		const reason = String((await event.request.formData()).get('reason') ?? '').trim();
		if (!reason || reason.length > 500)
			return fail(400, { flagError: "Say what's wrong (up to 500 characters)." });

		const { season, match, mode } = context(event);
		if (mode !== 'flag') return fail(409, { error: true, message: "You can't flag this result." });
		flagMatch(match, user.id, reason);
		postToOrganizers(
			flagEmbed(
				matchPost(event.url.origin, season, match, resultOf(match)!),
				user.displayName,
				reason
			)
		);
		return { message: 'Flagged. An organizer will check it.' };
	}
};
