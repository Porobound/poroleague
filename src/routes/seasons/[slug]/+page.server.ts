import { error, fail } from '@sveltejs/kit';
import { addDays, reportingClosed, roundsOfWeek, weekOf } from '#lib/league/time.ts';
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
	const rounds = roundsOfWeek(ctx.week, season.roundsPerWeek, maxRound);
	// Week w runs from the start date + 7(w-1) days for 7 days, but never past the deadline.
	const weekEnd =
		season.startDate && ctx.week >= 1 ? addDays(season.startDate, ctx.week * 7 - 1) : null;
	const weekEnds =
		weekEnd && season.deadline && season.deadline < weekEnd ? season.deadline : weekEnd;
	const me = list.find((e) => e.playerId === locals.user?.id);
	const mine = me && scheduled ? playerMatches(season.id, me.playerId) : [];
	// A group's last round; a smaller group runs out of rounds before the bigger one.
	const myRounds = groups.find((g) => g.group === me?.group)?.rounds ?? 0;
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
		// Odd groups give someone a bye each round; say so, or a missing match looks like a bug.
		myByes: rounds
			? Array.from({ length: rounds[1] - rounds[0] + 1 }, (_, i) => rounds[0] + i).filter(
					(r) => r <= myRounds && !mine.some((m) => m.round === r)
				)
			: [],
		myWeek:
			signedUp && scheduled
				? mine
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
