import { error } from '@sveltejs/kit';
import { legendMatches, playerLegends } from '#lib/league/legendStats.ts';
import { playerSeasons, seasonHistory } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const list = playerSeasons(params.id);
	if (!list.length) error(404, 'Player not found');
	const rows = list.flatMap((s) => (s.row ? [s.row] : []));
	const sum = (k: 'played' | 'wins' | 'draws' | 'losses' | 'gameWins' | 'gameLosses') =>
		rows.reduce((n, r) => n + r[k], 0);
	const counted = list.flatMap((s) => legendMatches(s.matches, s.dropped));
	const games = sum('gameWins') + sum('gameLosses');
	return {
		player: list[0].me,
		first: list.at(-1)!.season.name,
		totals: {
			played: sum('played'),
			wdl: `${sum('wins')}–${sum('draws')}–${sum('losses')}`,
			gwp: games ? sum('gameWins') / games : null
		},
		dice: {
			won: counted.filter((m) => m.diceWinnerId === params.id).length,
			of: counted.length
		},
		history: seasonHistory(list),
		legends: playerLegends(counted, params.id)
	};
};
