import { error, fail, redirect } from '@sveltejs/kit';
import { legendMatches, playerLegends } from '#lib/league/legendStats.ts';
import { published } from '#lib/league/publish.ts';
import { weekOf } from '#lib/league/time.ts';
import { cardContext, matchCard } from '#lib/matchCard.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { playerMatches } from '#lib/server/matches.ts';
import { erasePlayer } from '#lib/server/players.ts';
import { postToOrganizers } from '#lib/server/webhooks.ts';
import { dropEmbed } from '#lib/discord.ts';
import {
	groupStandings,
	playerSeasons,
	publicSeason,
	seasonEntries,
	seasonHistory
} from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const season = publicSeason(params.slug, locals.user);
	const list = seasonEntries(season.id);
	const player = list.find((e) => e.playerId === params.id) ?? error(404, 'Player not found');
	const ctx = cardContext(season, list, locals.user?.id ?? null);
	const ms = published(playerMatches(season.id, player.playerId), season.publishedRound);
	const cards = ms.map((m) => ({
		week: weekOf(m.round, season.roundsPerWeek),
		card: matchCard(m, ctx)
	}));
	const counted = legendMatches(ms, ctx.dropped);
	const standing = groupStandings(season, list).find((g) => g.group === player.group);
	const rank = standing?.rows.findIndex((r) => r.playerId === player.playerId) ?? -1;

	return {
		season,
		player,
		row: rank >= 0 ? standing!.rows[rank] : null,
		rank: rank + 1,
		dice: {
			won: counted.filter((m) => m.diceWinnerId === player.playerId).length,
			of: counted.length
		},
		thisWeek: cards
			.filter(
				(c) => c.card.status === 'overdue' || (c.week === ctx.week && c.card.status === 'scheduled')
			)
			.map((c) => c.card),
		matches: cards.map((c) => c.card),
		legends: playerLegends(counted, player.playerId),
		history: seasonHistory(playerSeasons(player.playerId)),
		// Shows the control only; the action re-checks the role with Discord.
		canErase: !!locals.user?.isOrganizer && !player.former
	};
};

export const actions: Actions = {
	erase: async (event) => {
		const user = await organizerAction(event);
		const season = publicSeason(event.params.slug, user);
		const player = seasonEntries(season.id).find((e) => e.playerId === event.params.id);
		if (!player) error(404, 'Player not found');
		if (player.former) return fail(409, { message: 'This player is already erased.' });
		const typed = String((await event.request.formData()).get('confirm') ?? '').trim();
		if (typed !== player.displayName)
			return fail(400, { message: "Type the player's name to confirm." });
		const { name, dropped } = erasePlayer(player.playerId, user.id);
		// Same notice as a normal drop, under the new name only.
		for (const s of dropped)
			postToOrganizers(
				dropEmbed({
					player: name,
					by: user.displayName,
					where: s.name,
					url: `${event.url.origin}/seasons/${s.slug}/players/${player.playerId}`,
					erased: true
				})
			);
		// Before groups are locked, erasing takes them off the season, so this page is gone.
		if (season.status === 'signup' || season.status === 'groups')
			redirect(303, `/seasons/${season.slug}/admin/players`);
		return { message: `Player erased. Their results now show as ${name}.` };
	}
};
