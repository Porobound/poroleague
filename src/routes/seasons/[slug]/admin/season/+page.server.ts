import { fail, redirect } from '@sveltejs/kit';
import { seasonDeletedEmbed } from '#lib/discord.ts';
import { date } from '#lib/format.ts';
import { editableFields, parseSeasonForm, seasonFields } from '#lib/season.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { endState, seasonData } from '#lib/server/seasonAdmin.ts';
import {
	deleteSeason,
	drawGroups,
	earliestDeadline,
	finalizeSeason,
	getSeason,
	groupStandings,
	matchCount,
	runningSeason,
	seasonEntries,
	setStatus,
	setTiebreaks,
	slugTaken,
	updateSeason
} from '#lib/server/seasons.ts';
import { postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	const d = season.status === 'play' ? seasonData(season.id) : null;
	return {
		running: season.status === 'draft' ? (runningSeason(season.id) ?? null) : null,
		entryCount: d?.list.length ?? seasonEntries(season.id).length,
		matchCount: matchCount(season.id),
		end: d && endState(season, d)
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
		const { startDate, roundsPerWeek, deadline } = parsed.values;
		const earliest = earliestDeadline(season.id, startDate, roundsPerWeek);
		if (earliest && deadline < earliest)
			return fail(400, {
				errors: {
					deadline: `The last round's week ends ${date(earliest)}. Pick that day or later.`
				},
				raw: null
			});
		updateSeason(season, parsed.values, user.id);
		if (parsed.values.slug !== season.slug)
			redirect(303, `/seasons/${parsed.values.slug}/admin/season`);
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

	tiebreak: async (event) => {
		const user = await organizerAction(event);
		const ids = String((await event.request.formData()).get('order') ?? '').split(',');
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'play') return fail(409, { message: 'The season is not in play.' });
		const d = seasonData(season.id);
		if (!endState(season, d).ending)
			return fail(409, { message: 'Ties are settled at the end of the season.' });
		const rows = groupStandings(season, d.list, d.all).flatMap((g) => g.rows);
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
		if (!endState(season, seasonData(season.id)).ready)
			return fail(409, { message: 'Resolve the flags and order the ties before finalizing.' });
		finalizeSeason(season.id, user.id);
		return { message: `${season.name} is finalized and in the archive.` };
	},

	delete: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		const hasResults =
			season.status === 'play' || season.status === 'topcut' || season.status === 'finished';
		const typed = String((await event.request.formData()).get('confirmSlug') ?? '');
		if (hasResults && typed !== season.slug)
			return fail(400, { message: `Type ${season.slug} to delete a season that has matches.` });
		deleteSeason(season, user.id);
		postToOrganizers(seasonDeletedEmbed(season.name, user.displayName));
		redirect(303, '/admin');
	}
};
