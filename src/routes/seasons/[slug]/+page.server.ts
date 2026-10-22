import { error, fail } from '@sveltejs/kit';
import { addDays, reportingClosed, weekOf } from '#lib/league/time.ts';
import { cardContext, matchCard } from '#lib/matchCard.ts';
import { seasonPhases } from '#lib/season.ts';
import { currentRole, playerAction } from '#lib/server/auth.ts';
import { playerMatches } from '#lib/server/matches.ts';
import {
	addEntry,
	getSeason,
	groupStandings,
	removeEntry,
	seasonEntries
} from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { params, locals } = event;
	const season = getSeason(params.slug, locals.user);
	// getSeason only trusts the session flag; drafts also need the role re-checked with Discord.
	if (season.status === 'draft' && !(await currentRole(event))) error(404, 'Season not found');
	const list = seasonEntries(season.id);
	const scheduled = season.status === 'play' || season.status === 'finished';
	const groups = scheduled ? groupStandings(season, list) : [];
	const closed = reportingClosed(season.deadline, new Date());
	const ctx = cardContext(season, list, locals.user?.id ?? null);
	const maxRound = Math.max(0, ...groups.map((g) => g.rounds));
	const weeks = weekOf(maxRound, season.roundsPerWeek);
	const first = (ctx.week - 1) * season.roundsPerWeek + 1;
	const rounds: [number, number] | null =
		ctx.week >= 1 && first <= maxRound
			? [first, Math.min(ctx.week * season.roundsPerWeek, maxRound)]
			: null;
	// Week w runs from the start date + 7(w-1) days for 7 days, but never past the deadline.
	const weekEnd =
		season.startDate && ctx.week >= 1 ? addDays(season.startDate, ctx.week * 7 - 1) : null;
	const weekEnds =
		weekEnd && season.deadline && season.deadline < weekEnd ? season.deadline : weekEnd;
	const signedUp = !!locals.user && list.some((e) => e.playerId === locals.user!.id);
	return {
		season,
		entries: list,
		groups,
		// Ties only need an organizer once results are in; mid-season they sort themselves out.
		showTies: season.status === 'finished' || closed,
		closed,
		week: ctx.week,
		weeks,
		rounds,
		weekEnds,
		phases: seasonPhases(season, {
			week: ctx.week,
			weeks,
			rounds,
			groups: groups.map((g) => g.size),
			closed
		}),
		signedUp,
		// This week's matches plus anything overdue; the full list lives on the player page.
		myWeek:
			signedUp && scheduled
				? playerMatches(season.id, locals.user!.id)
						.map((m) => ({ m, card: matchCard(m, ctx) }))
						.filter(
							({ m, card }) =>
								card.status === 'overdue' || weekOf(m.round, season.roundsPerWeek) === ctx.week
						)
						.map(({ card }) => card)
				: []
	};
};

export const actions: Actions = {
	join: async (event) => {
		const user = playerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup') return fail(409, { message: 'Signup is closed.' });
		addEntry(season.id, user.id);
		return { message: "You're in. See you in the groups." };
	},

	withdraw: async (event) => {
		const user = playerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup')
			return fail(409, {
				message: 'Signup is closed, so you can no longer withdraw. Ask an organizer.'
			});
		removeEntry(season.id, user.id);
		return { message: `You withdrew from ${season.name}.` };
	}
};
