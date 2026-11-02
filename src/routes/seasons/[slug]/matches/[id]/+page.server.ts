import { error, fail } from '@sveltejs/kit';
import { LEGENDS } from '#lib/legends.ts';
import { flagEmbed, resultEmbed } from '#lib/discord.ts';
import { isUnlocked, visibleTo } from '#lib/league/holiday.ts';
import { isPublished } from '#lib/league/publish.ts';
import { matchMode, parseReport } from '#lib/league/report.ts';
import { weekOf } from '#lib/league/time.ts';
import { currentRole, playerAction } from '#lib/server/auth.ts';
import { seasonUnlocks } from '#lib/server/holidays.ts';
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
import { cutRounds, waitingOnFlag } from '#lib/server/topCut.ts';
import { postResult, postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

type Event = { params: { slug: string; id: string }; locals: App.Locals };

// Everything an action checks, read in one go. Actions call it after awaiting the form, with no
// await between this and the write, so two requests can't interleave.
function find({ params, locals }: Event) {
	const season = getSeason(params.slug, locals.user);
	const id = Number(params.id);
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	return { season, match, hidden: !!match && !isPublished(match, season.publishedRound) };
}

function context(event: Event, organizer = false, { season, match, hidden } = find(event)) {
	if (!match) error(404, 'Match not found');
	// Unpublished pairings stay secret, except a holiday's early match for its two players and
	// (view only) organizers.
	if (hidden) {
		const { unlocked } = seasonUnlocks(season);
		if (
			!visibleTo(match, event.locals.user?.id ?? null, season, unlocked) &&
			!(organizer && isUnlocked(match, season, unlocked))
		)
			error(404, 'Match not found');
	}
	const { inPlay, closed } = liveState(match, season);
	const voided = isVoided(match);
	let mode = matchMode(match, {
		viewerId: event.locals.user?.id ?? null,
		inPlay,
		closed,
		voided: voided || !!match.walkoverId
	});
	// Top cut: reporting waits while a result feeding this match is flagged, since the fix may
	// change who plays it.
	const waiting = match.stage === 'playoff' && mode === 'report' && waitingOnFlag(season, match);
	if (waiting) mode = 'view';
	return { season, match, mode, closed, voided, waiting };
}

export const load: PageServerLoad = async (event) => {
	// Organizers may look at an early match; currentRole re-checks the role with Discord at most
	// once a minute, never the session flag alone. Published matches need neither.
	const found = find(event);
	const organizer = found.hidden && !!event.locals.user?.isOrganizer && (await currentRole(event));
	const { season, match, mode, closed, voided, waiting } = context(event, organizer, found);
	const [p1, p2] = matchPlayers(match);
	const viewer = event.locals.user?.id ?? null;
	const card = matchCard(
		match,
		cardContext(
			season,
			seasonEntries(season.id),
			viewer,
			new Date(),
			cutRounds(season.id),
			seasonUnlocks(season).away
		)
	);
	return {
		season,
		match,
		// Same status rule as every match card.
		status: card.status,
		head: card.props.head,
		// On holiday name tags, p1 then p2.
		tags: { p1: card.props.sides[0].tag, p2: card.props.sides[1].tag },
		// "Played early, hidden from standings until week N is published" before its week is out.
		earlyNote: isPublished(match, season.publishedRound) ? null : card.props.note,
		mode,
		closed,
		voided,
		waiting,
		walkover: match.walkoverId
			? [p1, p2].find((p) => p.id === match.walkoverId)!.displayName
			: null,
		p1,
		p2,
		legends: LEGENDS,
		// Only the form needs it; anyone else gets no hint of a player's last legend.
		prefill:
			mode === 'report'
				? {
						p1Legend: match.p1Legend ?? lastLegend(match.p1Id, match.p1Id === viewer) ?? '',
						p2Legend: match.p2Legend ?? lastLegend(match.p2Id, match.p2Id === viewer) ?? ''
					}
				: null
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
		// An early result posts when its week is published.
		if (!isPublished(match, season.publishedRound))
			return {
				message: `Result saved. It stays hidden from everyone else until week ${weekOf(match.round, season.roundsPerWeek)} is published.`
			};
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
