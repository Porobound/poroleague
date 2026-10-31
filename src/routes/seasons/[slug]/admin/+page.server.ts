import { fail } from '@sveltejs/kit';
import { pairingsPost } from '#lib/discord.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { auditLines } from '#lib/server/auditLog.ts';
import { adminRows, bracketMatches } from '#lib/server/matches.ts';
import { editResult, keepFlag } from '#lib/server/resultActions.ts';
import { weekOf } from '#lib/league/time.ts';
import { nextPairings, seasonData } from '#lib/server/seasonAdmin.ts';
import { getSeason, groupStandings, publishWeek, seasonProgress } from '#lib/server/seasons.ts';
import { playerNames } from '#lib/server/players.ts';
import { cutRounds } from '#lib/server/topCut.ts';
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
		pairings: season.status === 'play' ? nextPairings(season, d) : null,
		publishedWeeks: weekOf(season.publishedRound, season.roundsPerWeek),
		discord: pairingsEnabled(),
		flags:
			season.status === 'play'
				? adminRows(
						season,
						d.list,
						d.live.filter((m) => m.flaggedBy && !m.flagResolvedAt)
					)
				: season.status === 'topcut'
					? adminRows(
							season,
							d.list,
							bracketMatches(season.id).filter((m) => m.flaggedBy && !m.flagResolvedAt),
							cutRounds(season.id)
						)
					: [],
		recent: auditLines(season.id, 5)
	};
};

export const actions: Actions = {
	edit: editResult,
	keep: keepFlag,

	publish: async (event) => {
		const user = await organizerAction(event);
		const week = Number((await event.request.formData()).get('week'));
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'play') return fail(409, { message: 'The season is not in play.' });
		const p = nextPairings(season, seasonData(season.id));
		// The form names its week, so a double submit can't publish the week after too.
		if (!p || p.week !== week)
			return fail(409, {
				message: 'That week is already published, or nothing is left to publish.'
			});
		publishWeek(season.id, p.week, p.rounds, user.id);
		const discord = pairingsEnabled() && p.count > 0;
		if (discord)
			postPairings(
				pairingsPost(
					`${season.name} · Week ${p.week}`,
					`${event.url.origin}/seasons/${season.slug}/schedule`,
					p.byRound,
					playerNames(p.byRound.flatMap((r) => r.pairs.flatMap((x) => [x.p1Id, x.p2Id])))
				)
			);
		return { message: `Week ${p.week} published${discord ? ' and posted in Discord' : ''}.` };
	}
};
