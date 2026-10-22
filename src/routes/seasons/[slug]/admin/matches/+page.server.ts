import { error, fail } from '@sveltejs/kit';
import { organizerEditEmbed, resultEmbed } from '#lib/discord.ts';
import { parseReport } from '#lib/league/report.ts';
import { cardContext, matchCard, type Status } from '#lib/matchCard.ts';
import { organizerAction } from '#lib/server/auth.ts';
import {
	getMatch,
	isVoided,
	keepResult,
	lastLegend,
	matchPost,
	organizerEdit,
	resultOf,
	seasonMatches
} from '#lib/server/matches.ts';
import { getSeason, seasonEntries } from '#lib/server/seasons.ts';
import { postResult, postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const FILTERS = {
	all: () => true,
	unplayed: (s: Status) => s === 'scheduled' || s === 'overdue',
	reported: (s: Status) => s === 'reported',
	flagged: (s: Status) => s === 'flagged',
	void: (s: Status) => s === 'void'
};
type Filter = keyof typeof FILTERS;

export const load: PageServerLoad = async ({ parent, url }) => {
	const { season } = await parent();
	const list = seasonEntries(season.id);
	const ctx = cardContext(season, list, null);
	const name = (id: string) => list.find((e) => e.playerId === id)?.displayName ?? 'Unknown';
	const f = url.searchParams.get('status') ?? '';
	const filter: Filter = f in FILTERS ? (f as Filter) : 'all';
	const rows = seasonMatches(season.id)
		.map((m) => ({ m, status: matchCard(m, ctx).status }))
		.filter(({ status }) => FILTERS[filter](status))
		.map(({ m, status }) => ({
			id: m.id,
			round: m.round,
			group: m.group,
			status,
			reported: !!m.reportedBy,
			p1: { id: m.p1Id, name: name(m.p1Id) },
			p2: { id: m.p2Id, name: name(m.p2Id) },
			score: m.reportedBy ? `${m.p1Games}–${m.p2Games}` : '–',
			legends: m.reportedBy ? `${m.p1Legend} · ${m.p2Legend}` : '',
			flag: status === 'flagged' ? { by: name(m.flaggedBy!), reason: m.flagReason ?? '' } : null,
			// ponytail: lastLegend is 2 queries per unreported match; fine at league size (~150 matches).
			values: {
				p1Games: m.p1Games?.toString() ?? '',
				p2Games: m.p2Games?.toString() ?? '',
				p1Legend: m.p1Legend ?? lastLegend(m.p1Id) ?? '',
				p2Legend: m.p2Legend ?? lastLegend(m.p2Id) ?? '',
				dice: m.diceWinnerId ?? ''
			}
		}));
	return { rows, filter, canEdit: season.status === 'play' };
};

// Reads the form first; callers write with no await after this, so two requests can't interleave.
async function target(event: RequestEvent) {
	const user = await organizerAction(event);
	const form = await event.request.formData();
	const season = getSeason(event.params.slug, user);
	const id = Number(form.get('matchId'));
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	if (!match) error(404, 'Match not found');
	return { user, form, season, match };
}

export const actions: Actions = {
	edit: async (event) => {
		const { user, form, season, match } = await target(event);
		if (season.status !== 'play')
			return fail(409, { message: 'Results can only change while the season is in play.' });
		if (isVoided(match)) return fail(409, { message: 'A player dropped, so this match is void.' });
		const parsed = parseReport(form, match.p1Id, match.p2Id);
		if (!parsed.ok) return fail(400, { message: Object.values(parsed.errors).join(' ') });
		const resolves = !!match.flaggedBy && !match.flagResolvedAt;
		organizerEdit(match, user.id, parsed.values);
		const post = matchPost(event.url.origin, season, match, parsed.values);
		if (!match.reportedBy) postResult(resultEmbed(post));
		else postToOrganizers(organizerEditEmbed(post, user.displayName, { resolves, kept: false }));
		return { message: resolves ? 'Result changed. Flag resolved.' : 'Result saved and logged.' };
	},

	keep: async (event) => {
		const { user, season, match } = await target(event);
		if (season.status !== 'play' || !match.flaggedBy || match.flagResolvedAt)
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
};
