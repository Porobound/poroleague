import { fail } from '@sveltejs/kit';
import { pairingsPost } from '#lib/discord.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { auditLines } from '#lib/server/auditLog.ts';
import { adminRows } from '#lib/server/matches.ts';
import { editResult, keepFlag } from '#lib/server/resultActions.ts';
import { seasonData, weekPairings } from '#lib/server/seasonAdmin.ts';
import { getSeason, groupStandings, seasonProgress } from '#lib/server/seasons.ts';
import { pairingsEnabled, postPairings } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	const d = seasonData(season.id);
	// Groups exist from the draw on; the phase bar names their sizes.
	const drawn = season.status !== 'draft' && season.status !== 'signup';
	const groups = drawn ? groupStandings(season, d.list, d.all) : [];
	const progress = seasonProgress(season, groups);
	return {
		phases: progress.phases,
		week: progress.week,
		weeks: progress.weeks,
		pairings: season.status === 'play' ? weekPairings(season, d) : null,
		flags:
			season.status === 'play'
				? adminRows(
						season,
						d.list,
						d.live.filter((m) => m.flaggedBy && !m.flagResolvedAt)
					)
				: [],
		recent: auditLines(season.id, 5)
	};
};

export const actions: Actions = {
	edit: editResult,
	keep: keepFlag,

	postPairings: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'play') return fail(409, { message: 'The season is not in play.' });
		if (!pairingsEnabled())
			return fail(409, { message: 'Set WEBHOOK_PAIRINGS_URL to post pairings.' });
		const p = weekPairings(season, seasonData(season.id));
		if (!p) return fail(409, { message: 'No rounds left to post.' });
		postPairings(
			pairingsPost(
				`${season.name} · Week ${p.week}`,
				`${event.url.origin}/seasons/${season.slug}/schedule`,
				p.byRound
			)
		);
		return { message: `Week ${p.week} pairings posted in Discord.` };
	}
};
