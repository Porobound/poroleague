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
import { cardContext, earlyNote, liveState, matchCard } from '#lib/matchCard.ts';
import { MAX_REPLAY_BYTES, TOO_BIG } from '#lib/replay.ts';
import {
	canSeeReplays,
	deleteReplay,
	inMatch,
	matchReplays,
	saveReplay,
	setPublish
} from '#lib/server/replays.ts';
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
	// once a minute, never the session flag alone. They also see a played match's replays. Other
	// matches need no role.
	const found = find(event);
	const organizer =
		(found.hidden || found.match?.p1Games != null) &&
		!!event.locals.user?.isOrganizer &&
		(await currentRole(event));
	const { season, match, mode, closed, voided, waiting } = context(event, organizer, found);
	const [p1, p2] = matchPlayers(match);
	const viewer = event.locals.user?.id ?? null;
	const playing = viewer === p1.id || viewer === p2.id;
	const { away, revoked } = seasonUnlocks(season);
	const card = matchCard(match, {
		...cardContext(season, seasonEntries(season.id), viewer, new Date(), cutRounds(season.id)),
		away,
		revoked
	});
	return {
		season,
		// Without who has agreed to publish replays: that is between the two players.
		match: { ...match, p1PublishReplay: undefined, p2PublishReplay: undefined },
		// Same status rule as every match card.
		status: card.status,
		head: card.props.head,
		// On holiday name tags, p1 then p2.
		tags: { p1: card.props.sides[0].tag, p2: card.props.sides[1].tag },
		// A played early match says so, next to whatever the card's own note says.
		earlyNote:
			found.hidden && match.reportedBy
				? earlyNote(weekOf(match.round, season.roundsPerWeek))
				: null,
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
		// Null: no result to have replays of, or not this viewer's to see.
		replays:
			match.p1Games !== null && canSeeReplays(match, viewer, organizer, found.hidden)
				? {
						games: matchReplays(match.id).map((r) => ({
							game: r.game,
							by: (r.uploadedBy === p1.id ? p1 : p2).displayName
						})),
						// A match with an erased player keeps no replays.
						canUpload: playing && !p1.former && !p2.former,
						canDelete: playing || organizer,
						// How many games the match had, for choosing which one a file is.
						played: match.games?.length ?? match.p1Games + (match.p2Games ?? 0),
						// Who has said yes to showing them to everyone; the viewer's own side first.
						published: playing
							? viewer === p1.id
								? ([match.p1PublishReplay, match.p2PublishReplay] as const)
								: ([match.p2PublishReplay, match.p1PublishReplay] as const)
							: null
					}
				: null,
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
	},

	// Either player adds or replaces a game's replay, at any time once the result is in.
	replay: async (event) => {
		const user = playerAction(event);
		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || !file.size)
			return fail(400, { error: true, message: 'Choose a replay file first.' });
		if (file.size > MAX_REPLAY_BYTES) return fail(400, { error: true, message: TOO_BIG });
		const text = await file.text();
		// Empty: the game the file says it is.
		const game = Number(form.get('game'));
		const { season, match } = context(event);
		if (!inMatch(match, user.id))
			return fail(403, { error: true, message: 'Only the two players can add a replay.' });
		const error = saveReplay(
			match,
			season.createdAt,
			user.id,
			text,
			Number.isInteger(game) && game > 0 ? game : undefined
		);
		if (error) return fail(400, { error: true, message: error });
		const opponent = matchPlayers(match).find((p) => p.id !== user.id)!.displayName;
		return { message: `Replay saved. Only you and ${opponent} can see it.` };
	},

	// A player's yes or no to showing the replays to everyone; it takes both.
	publishReplays: async (event) => {
		const user = playerAction(event);
		const on = (await event.request.formData()).get('on') === '1';
		const { match } = context(event);
		const them = matchPlayers(match).find((p) => p.id !== user.id)!;
		if (user.id !== match.p1Id && user.id !== match.p2Id)
			return fail(403, { error: true, message: 'Only the two players can publish replays.' });
		if (!setPublish(match, user.id, on))
			return fail(409, { error: true, message: 'Add a replay first.' });
		if (!on) return { message: `Unpublished. Only you and ${them.displayName} see the replays.` };
		const theirs = them.id === match.p1Id ? match.p1PublishReplay : match.p2PublishReplay;
		return {
			message: theirs
				? 'Published. Anyone can watch the replays now.'
				: `You said yes. The replays go public once ${them.displayName} publishes too.`
		};
	},

	deleteReplay: async (event) => {
		const user = playerAction(event);
		const organizer = user.isOrganizer && (await currentRole(event));
		const game = Number((await event.request.formData()).get('game'));
		const { match } = context(event, organizer);
		if (!organizer && !inMatch(match, user.id))
			return fail(403, { error: true, message: "This replay isn't yours to delete." });
		if (!deleteReplay(match, user.id, game))
			return fail(404, { error: true, message: 'That replay is already gone.' });
		return { message: `Game ${game} replay deleted.` };
	}
};
