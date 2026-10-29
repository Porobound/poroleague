import { fail, redirect } from '@sveltejs/kit';
import { date } from '#lib/format.ts';
import { organizerAction } from '#lib/server/auth.ts';
import {
	drawGroups,
	earliestDeadline,
	getSeason,
	groupsOf,
	lockGroups,
	reopenSignup,
	seasonEntries,
	setGroup
} from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	return { groups: groupsOf(seasonEntries(season.id)) };
};

async function inGroupsPhase(event: RequestEvent) {
	const user = await organizerAction(event);
	const season = getSeason(event.params.slug, user);
	return season.status === 'groups' ? season : null;
}

export const actions: Actions = {
	move: async (event) => {
		const season = await inGroupsPhase(event);
		if (!season) return fail(409, { message: 'Groups are locked.' });
		const form = await event.request.formData();
		const list = seasonEntries(season.id);
		const entry = list.find((e) => e.playerId === form.get('playerId'));
		const to = Number(form.get('to'));
		if (
			!entry ||
			!Number.isInteger(to) ||
			to < 1 ||
			to > groupsOf(list).length ||
			to === entry.group
		)
			return fail(400, { message: 'Pick another group to move to.' });
		setGroup(season.id, entry.playerId, to);
		return {};
	},

	redraw: async (event) => {
		const season = await inGroupsPhase(event);
		if (!season) return fail(409, { message: 'Groups are locked.' });
		drawGroups(season.id, season.groupSize);
		return { message: 'Groups redrawn at random.' };
	},

	reopenSignup: async (event) => {
		const season = await inGroupsPhase(event);
		if (!season)
			return fail(409, { message: 'Groups are locked, so signup can no longer be reopened.' });
		reopenSignup(season.id);
		redirect(303, `/seasons/${season.slug}/admin/season`);
	},

	lock: async (event) => {
		const season = await inGroupsPhase(event);
		if (!season) return fail(409, { message: 'Groups are already locked.' });
		const groups = groupsOf(seasonEntries(season.id));
		if (!groups.length || groups.some((g) => g.length < 2))
			return fail(400, { message: 'Every group needs at least 2 players.' });
		const earliest =
			season.startDate && earliestDeadline(season.id, season.startDate, season.roundsPerWeek);
		if (earliest && season.deadline && season.deadline < earliest)
			return fail(400, {
				message: `The last round's week ends ${date(earliest)}, after the deadline. Move the deadline on Season first.`
			});
		lockGroups(season.id);
		redirect(303, `/seasons/${season.slug}/admin/groups`);
	}
};
