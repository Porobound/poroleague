import { fail, redirect } from '@sveltejs/kit';
import { asRaw, editableFields, NEW_SEASON, parseSeasonForm } from '#lib/season.ts';
import { organizerAction, organizerPage } from '#lib/server/auth.ts';
import { allSeasons, createSeason, slugTaken } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await organizerPage(event);
	return { seasons: allSeasons() };
};

export const actions: Actions = {
	create: async (event) => {
		await organizerAction(event);
		const form = await event.request.formData();
		const parsed = parseSeasonForm(form, NEW_SEASON, editableFields('draft'));
		if (!parsed.ok) return fail(400, { errors: parsed.errors, raw: parsed.raw });
		if (slugTaken(parsed.values.slug))
			return fail(400, {
				errors: { slug: 'Another season already uses this slug.' },
				raw: asRaw(parsed.values)
			});
		createSeason(parsed.values);
		redirect(303, `/seasons/${parsed.values.slug}/admin/season`);
	}
};
