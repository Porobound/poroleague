import { fail } from '@sveltejs/kit';
import { dropEmbed } from '#lib/discord.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import {
	cancelDrop,
	dropPlayer,
	getSeason,
	groupStandings,
	removeEntry,
	seasonEntries
} from '#lib/server/seasons.ts';
import { postToOrganizers } from '#lib/server/webhooks.ts';
import { hasSchedule } from '#lib/season.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	const list = seasonEntries(season.id);
	const scheduled = hasSchedule(season.status);
	const rows = new Map(
		scheduled ? groupStandings(season, list).flatMap((g) => g.rows.map((r) => [r.playerId, r])) : []
	);
	const ms = scheduled ? seasonMatches(season.id) : [];
	// Signup order until the schedule exists; stable, so same-second signups stay alphabetical.
	const ordered = scheduled ? list : list.toSorted((a, b) => +a.joinedAt - +b.joinedAt);
	return {
		entries: ordered.map((e) => {
			const r = rows.get(e.playerId);
			return {
				...e,
				record: r ? { played: r.played, wdl: `${r.wins}–${r.draws}–${r.losses}` } : null,
				matches: ms.filter((m) => m.p1Id === e.playerId || m.p2Id === e.playerId).length,
				canCancel: season.status === 'play' && e.dropped && !e.former
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
	},

	cancelDrop: async (event) => {
		const user = await organizerAction(event);
		const playerId = String((await event.request.formData()).get('playerId'));
		const season = getSeason(event.params.slug, user);
		const entry = seasonEntries(season.id).find((e) => e.playerId === playerId);
		if (season.status !== 'play' || !entry?.dropped)
			return fail(409, {
				message: 'A drop can only be cancelled while the season is in play.'
			});
		if (entry.former)
			return fail(409, { message: 'An erased player can’t come back to the season.' });
		cancelDrop(season.id, playerId, user.id);
		postToOrganizers(
			dropEmbed({
				player: entry.displayName,
				by: user.displayName,
				where: season.name,
				url: `${event.url.origin}/seasons/${season.slug}/players/${playerId}`,
				cancelled: true
			})
		);
		return { message: `${entry.displayName}'s drop is cancelled. Their matches count again.` };
	}
};
