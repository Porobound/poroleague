import { error, fail, redirect } from '@sveltejs/kit';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';
import { choices, look, picks, type Slot } from '#lib/league/cosmetics.ts';
import { legendMatches, playerLegends } from '#lib/league/legendStats.ts';
import { careerAchievements } from '#lib/server/achievements.ts';
import { playerAction } from '#lib/server/auth.ts';
import { equip, ownedAchievements } from '#lib/server/cosmetics.ts';
import { db } from '#lib/server/db/index.ts';
import { playerSeasons, seasonHistory } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	const list = playerSeasons(params.id);
	if (!list.length) error(404, 'Player not found');
	const rows = list.flatMap((s) => (s.row ? [s.row] : []));
	const sum = (k: 'played' | 'wins' | 'draws' | 'losses' | 'gameWins' | 'gameLosses') =>
		rows.reduce((n, r) => n + r[k], 0);
	const counted = list.flatMap((s) => legendMatches(s.matches, s.dropped));
	const games = sum('gameWins') + sum('gameLosses');
	const me = list[0].me;
	// Only the owner gets the Customize panel, over what they earned.
	const c = locals.user?.id === params.id ? choices(ownedAchievements(params.id)) : null;
	return {
		player: me,
		cosmetics: look(me),
		plain: !!locals.plain,
		customize: c && {
			// ?customize links straight to the open panel.
			open: url.searchParams.has('customize'),
			choices: c,
			equipped: picks(me),
			left: ACHIEVEMENTS.length - c.badges.length
		},
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
		legends: playerLegends(counted, params.id),
		achievements: careerAchievements(db, params.id),
		allLegends: url.searchParams.has('all')
	};
};

export const actions: Actions = {
	// Anyone, logged in or not, flips whether they see cosmetics at all. Read in hooks.server.ts.
	cosmetics: ({ cookies, url }) => {
		if (cookies.get('cosmetics') === 'off') cookies.delete('cosmetics', { path: '/' });
		else
			cookies.set('cosmetics', 'off', {
				path: '/',
				maxAge: 60 * 60 * 24 * 365,
				sameSite: 'lax',
				httpOnly: true
			});
		redirect(303, url.pathname);
	},
	// The owner equips earned achievements. Not a result change: no audit row.
	customize: async (event) => {
		const user = playerAction(event);
		if (user.id !== event.params.id)
			return fail(403, { customizeError: 'You can only customize your own profile.' });
		const form = await event.request.formData();
		const pick = (k: Slot) => String(form.get(k) ?? '') || null;
		const bad = equip(user.id, {
			title: pick('title'),
			badge: pick('badge'),
			frame: pick('frame')
		});
		if (bad) return fail(400, { customizeError: `You haven’t earned that ${bad}.` });
		return { message: 'Profile updated. Your badge shows in standings and the bracket.' };
	}
};
