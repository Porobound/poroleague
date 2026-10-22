import { fail, redirect } from '@sveltejs/kit';
import { pairingsPost, seasonDeletedEmbed } from '#lib/discord.ts';
import { isVoid } from '#lib/league/status.ts';
import { currentWeek, reportingClosed, roundsOfWeek } from '#lib/league/time.ts';
import { editableFields, parseSeasonForm, seasonFields } from '#lib/season.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import {
	deleteSeason,
	drawGroups,
	getSeason,
	matchCount,
	runningSeason,
	seasonEntries,
	setStatus,
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
	const byRound = Array.from({ length: rounds[1] - rounds[0] + 1 }, (_, i) => rounds[0] + i).map(
		(round) => ({
			round,
			pairs: ms
				.filter((m) => m.round === round && !isVoid(m, dropped))
				.map((m) => ({ group: m.group, p1Id: m.p1Id, p2Id: m.p2Id }))
		})
	);
	return { week, rounds, byRound, count: byRound.reduce((n, r) => n + r.pairs.length, 0) };
}

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	return {
		running: season.status === 'draft' ? (runningSeason(season.id) ?? null) : null,
		entryCount: seasonEntries(season.id).length,
		matchCount: matchCount(season.id),
		pairings: season.status === 'play' ? weekPairings(season) : null
	};
};

export const actions: Actions = {
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
			p.byRound.map((r) => pairingsPost(`${season.name} · Week ${p.week}`, r.round, r.pairs))
		);
		return { message: `Week ${p.week} pairings posted in Discord.` };
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
