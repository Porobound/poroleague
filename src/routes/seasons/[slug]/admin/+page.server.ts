import { fail, redirect } from '@sveltejs/kit';
import { pairingsPost, seasonDeletedEmbed } from '#lib/discord.ts';
import { isVoid } from '#lib/league/status.ts';
import { currentWeek, reportingClosed, roundsOfWeek } from '#lib/league/time.ts';
import { editableFields, parseSeasonForm, seasonFields } from '#lib/season.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { adminRows, seasonMatches } from '#lib/server/matches.ts';
import { editResult, keepFlag } from '#lib/server/resultActions.ts';
import {
	deleteSeason,
	drawGroups,
	finalizeSeason,
	getSeason,
	groupStandings,
	matchCount,
	runningSeason,
	seasonEntries,
	setStatus,
	setTiebreaks,
	slugTaken,
	updateSeason,
	type Season
} from '#lib/server/seasons.ts';
import { pairingsEnabled, postPairings, postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

// This week's non-void matches by round (week 1 before the start date); null once reporting closed.
function weekPairings(season: Season, now = new Date()) {
	if (reportingClosed(season.deadline, now)) return null;
	const dropped = new Set(
		seasonEntries(season.id)
			.filter((e) => e.dropped)
			.map((e) => e.playerId)
	);
	const ms = seasonMatches(season.id);
	const week = Math.max(1, currentWeek(season.startDate, now));
	const rounds = roundsOfWeek(week, season.roundsPerWeek, Math.max(0, ...ms.map((m) => m.round)));
	if (!rounds) return null;
	const byRound = Array.from({ length: rounds[1] - rounds[0] + 1 }, (_, i) => rounds[0] + i)
		.map((round) => ({
			round,
			pairs: ms
				.filter((m) => m.round === round && !isVoid(m, dropped))
				.map((m) => ({ group: m.group, p1Id: m.p1Id, p2Id: m.p2Id }))
		}))
		.filter((r) => r.pairs.length);
	if (!byRound.length) return null;
	return { week, rounds, byRound, count: byRound.reduce((n, r) => n + r.pairs.length, 0) };
}

// End of season opens at the deadline, or earlier once every live match is reported.
function endState(season: Season, now = new Date()) {
	const list = seasonEntries(season.id);
	const dropped = new Set(list.filter((e) => e.dropped).map((e) => e.playerId));
	const live = seasonMatches(season.id).filter((m) => !isVoid(m, dropped));
	const closed = reportingClosed(season.deadline, now);
	const unplayed = live.filter((m) => !m.reportedBy).length;
	const openFlags = live.filter((m) => m.flaggedBy && !m.flagResolvedAt).length;
	const ending = closed || unplayed === 0;
	type Tie = {
		group: number;
		resolved: boolean;
		players: { playerId: string; name: string; avatar: string | null; place: number }[];
		points: number;
		gwp: number;
		h2h: string;
	};
	// Equal head-to-head between two players means they drew or never played.
	const h2h = (ids: string[]) => {
		if (ids.length > 2) return 'level';
		const m = live.find((m) => ids.includes(m.p1Id) && ids.includes(m.p2Id));
		return m?.reportedBy ? `drew ${m.p1Games}–${m.p2Games}` : 'not played';
	};
	const ties = ending
		? groupStandings(season, list).flatMap((g) => {
				const byKey = new Map<string, Tie>();
				g.rows.forEach((r, i) => {
					if (!r.tie) return;
					const t = byKey.get(r.tie) ?? {
						group: g.group,
						resolved: true,
						players: [],
						points: r.points,
						gwp: r.gwp,
						h2h: ''
					};
					t.players.push({ playerId: r.playerId, name: r.name, avatar: r.avatar, place: i + 1 });
					if (r.unresolvedTie) t.resolved = false;
					byKey.set(r.tie, t);
				});
				const ties = [...byKey.values()];
				for (const t of ties) t.h2h = h2h(t.players.map((p) => p.playerId));
				return ties;
			})
		: [];
	const ready = ending && !openFlags && ties.every((t) => t.resolved);
	return { closed, unplayed, openFlags, ending, ties, ready };
}

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	return {
		running: season.status === 'draft' ? (runningSeason(season.id) ?? null) : null,
		entryCount: seasonEntries(season.id).length,
		matchCount: matchCount(season.id),
		pairings: season.status === 'play' ? weekPairings(season) : null,
		end: season.status === 'play' ? endState(season) : null,
		flags:
			season.status === 'play'
				? adminRows(
						season,
						seasonEntries(season.id),
						seasonMatches(season.id).filter((m) => m.flaggedBy && !m.flagResolvedAt)
					).filter((r) => r.status === 'flagged')
				: []
	};
};

export const actions: Actions = {
	edit: editResult,
	keep: keepFlag,

	save: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		const parsed = parseSeasonForm(
			await event.request.formData(),
			seasonFields(season),
			editableFields(season.status)
		);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, raw: parsed.raw });
		if (slugTaken(parsed.values.slug, season.id))
			return fail(400, { errors: { slug: 'Another season already uses this slug.' }, raw: null });
		updateSeason(season.id, parsed.values);
		if (parsed.values.slug !== season.slug) redirect(303, `/seasons/${parsed.values.slug}/admin`);
		return { saved: true };
	},

	openSignup: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'draft') return fail(409, { message: 'Signup was already opened.' });
		const running = runningSeason(season.id);
		if (running)
			return fail(409, {
				message: `${running.name} is still running. Only one season can be open at a time.`
			});
		setStatus(season.id, 'signup');
		return { message: 'Signup is open. The season page is now public.' };
	},

	closeSignup: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup') return fail(409, { message: 'Signup is not open.' });
		setStatus(season.id, 'groups');
		drawGroups(season.id);
		redirect(303, `/seasons/${season.slug}/admin/groups`);
	},

	postPairings: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'play') return fail(409, { message: 'The season is not in play.' });
		if (!pairingsEnabled())
			return fail(409, { message: 'Set WEBHOOK_PAIRINGS_URL to post pairings.' });
		const p = weekPairings(season);
		if (!p) return fail(409, { message: 'No rounds left to post.' });
		postPairings(
			pairingsPost(
				`${season.name} · Week ${p.week}`,
				`${event.url.origin}/seasons/${season.slug}/schedule`,
				p.byRound
			)
		);
		return { message: `Week ${p.week} pairings posted in Discord.` };
	},

	tiebreak: async (event) => {
		const user = await organizerAction(event);
		const ids = String((await event.request.formData()).get('order') ?? '').split(',');
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'play' || !endState(season).ending)
			return fail(409, { message: 'Ties are settled at the end of the season.' });
		const rows = groupStandings(season, seasonEntries(season.id)).flatMap((g) => g.rows);
		const key = rows.find((r) => r.playerId === ids[0])?.tie;
		const cluster = rows.filter((r) => key && r.tie === key).map((r) => r.playerId);
		if (
			!key ||
			new Set(ids).size !== ids.length ||
			cluster.length !== ids.length ||
			!ids.every((id) => cluster.includes(id))
		)
			return fail(400, { message: 'Those players are no longer tied. Reload and try again.' });
		setTiebreaks(season.id, ids, user.id);
		return { message: 'Tiebreak order saved.' };
	},

	finalize: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'play') return fail(409, { message: 'The season is not in play.' });
		if (!endState(season).ready)
			return fail(409, { message: 'Resolve the flags and order the ties before finalizing.' });
		finalizeSeason(season.id, user.id);
		return { message: `${season.name} is finalized and in the archive.` };
	},

	delete: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		const hasResults = season.status === 'play' || season.status === 'finished';
		const typed = String((await event.request.formData()).get('confirmSlug') ?? '');
		if (hasResults && typed !== season.slug)
			return fail(400, { message: `Type ${season.slug} to delete a season that has matches.` });
		deleteSeason(season, user.id);
		postToOrganizers(seasonDeletedEmbed(season.name, user.displayName));
		redirect(303, '/admin');
	}
};
