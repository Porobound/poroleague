import { fail, redirect } from '@sveltejs/kit';
import { editableFields, parseSeasonForm, seasonFields } from '#lib/season.ts';
import { organizerAction } from '#lib/server/auth.ts';
import {
	deleteSeason,
	drawGroups,
	getSeason,
	matchCount,
	runningSeason,
	seasonEntries,
	setStatus,
	slugTaken,
	updateSeason
} from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	return {
		running: season.status === 'draft' ? (runningSeason(season.id) ?? null) : null,
		entryCount: seasonEntries(season.id).length,
		matchCount: matchCount(season.id)
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

	delete: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		const hasResults = season.status === 'play' || season.status === 'finished';
		const typed = String((await event.request.formData()).get('confirmSlug') ?? '');
		if (hasResults && typed !== season.slug)
			return fail(400, { message: `Type ${season.slug} to delete a season that has matches.` });
		deleteSeason(season, user.id);
		redirect(303, '/admin');
	}
};
