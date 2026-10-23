import { error } from '@sveltejs/kit';
import { legendMatches, playerLegends } from '#lib/league/legendStats.ts';
import { published } from '#lib/league/publish.ts';
import { weekOf } from '#lib/league/time.ts';
import { cardContext, matchCard } from '#lib/matchCard.ts';
import { playerMatches } from '#lib/server/matches.ts';
import {
	groupStandings,
	playerSeasons,
	publicSeason,
	seasonEntries,
	seasonHistory
} from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

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
		history: seasonHistory(playerSeasons(player.playerId))
	};
};
