import { error, fail } from '@sveltejs/kit';
import { LEGENDS } from '#lib/legends.ts';
import { flagEmbed, resultEmbed } from '#lib/discord.ts';
import { matchMode, parseReport } from '#lib/league/report.ts';
import { reportingClosed } from '#lib/league/time.ts';
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
import { cardContext, matchCard } from '#lib/matchCard.ts';
import { getSeason, seasonEntries } from '#lib/server/seasons.ts';
import { postResult, postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

type Event = { params: { slug: string; id: string }; locals: App.Locals };

// Everything an action checks, read in one go. Actions call it after awaiting the form, with no
// await between this and the write, so two requests can't interleave.
function context({ params, locals }: Event) {
	const season = getSeason(params.slug, locals.user);
	const id = Number(params.id);
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	if (!match) error(404, 'Match not found');
	const closed = reportingClosed(season.deadline, new Date());
	const voided = isVoided(match);
	const mode = matchMode(match, {
		viewerId: locals.user?.id ?? null,
		inPlay: season.status === 'play',
		closed,
		voided
	});
	return { season, match, mode, closed, voided };
}

export const load: PageServerLoad = (event) => {
	const { season, match, mode, closed, voided } = context(event);
	const [p1, p2] = matchPlayers(match);
	const viewer = event.locals.user?.id ?? null;
	return {
		season,
		match,
		// Same status rule as every match card.
		status: matchCard(match, cardContext(season, seasonEntries(season.id), viewer)).status,
		mode,
		closed,
		voided,
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
		return { message: 'Flagged. An organizer will take a look.' };
	}
};
