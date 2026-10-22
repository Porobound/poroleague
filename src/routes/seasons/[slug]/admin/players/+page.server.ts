import { fail } from '@sveltejs/kit';
import { dropEmbed } from '#lib/discord.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import {
	dropPlayer,
	getSeason,
	groupStandings,
	removeEntry,
	seasonEntries
} from '#lib/server/seasons.ts';
import { postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	const list = seasonEntries(season.id);
	const scheduled = season.status === 'play' || season.status === 'finished';
	const rows = new Map(
		scheduled ? groupStandings(season, list).flatMap((g) => g.rows.map((r) => [r.playerId, r])) : []
	);
	const ms = scheduled ? seasonMatches(season.id) : [];
	return {
		entries: list.map((e) => {
			const r = rows.get(e.playerId);
			return {
				...e,
				record: r ? { played: r.played, wdl: `${r.wins}–${r.draws}–${r.losses}` } : null,
				matches: ms.filter((m) => m.p1Id === e.playerId || m.p2Id === e.playerId).length
			};
		})
	};
};

export const actions: Actions = {
	remove: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup')
			return fail(409, { message: 'Players can only be removed while signup is open.' });
		const playerId = String((await event.request.formData()).get('playerId'));
		removeEntry(season.id, playerId);
		return { message: 'Removed from signups.' };
	},

	drop: async (event) => {
		const user = await organizerAction(event);
		const playerId = String((await event.request.formData()).get('playerId'));
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'play')
			return fail(409, { message: 'Players can only be dropped while the season is in play.' });
		const entry = seasonEntries(season.id).find((e) => e.playerId === playerId);
		if (!entry || entry.dropped)
			return fail(409, { message: 'That player is not in the season or already dropped.' });
		dropPlayer(season.id, playerId, user.id);
		postToOrganizers(
			dropEmbed({
				player: entry.displayName,
				by: user.displayName,
				where: season.name,
				url: `${event.url.origin}/seasons/${season.slug}/players/${playerId}`
			})
		);
		return { message: `${entry.displayName} dropped. Their matches are void.` };
	}
};
