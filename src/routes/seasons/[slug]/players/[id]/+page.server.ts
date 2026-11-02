import { error, fail, redirect } from '@sveltejs/kit';
import { dateSpan } from '#lib/format.ts';
import { coversLabel, holidayWeeks, requestError, visibleTo } from '#lib/league/holiday.ts';
import { legendMatches, playerLegends } from '#lib/league/legendStats.ts';
import { look } from '#lib/league/cosmetics.ts';
import { isPublished, published } from '#lib/league/publish.ts';
import { leagueDate, weekOf } from '#lib/league/time.ts';
import { cardContext, matchCard } from '#lib/matchCard.ts';
import { organizerAction, playerAction } from '#lib/server/auth.ts';
import {
	cancelHoliday,
	requestHoliday,
	seasonHolidays,
	seasonUnlocks
} from '#lib/server/holidays.ts';
import { playerMatches, seasonMatches } from '#lib/server/matches.ts';
import { erasePlayer } from '#lib/server/players.ts';
import { postToOrganizers } from '#lib/server/webhooks.ts';
import { cutEraseEmbed, dropEmbed, holidayEmbed } from '#lib/discord.ts';
import {
	groupStandings,
	playerSeasons,
	publicSeason,
	seasonEntries,
	seasonHistory,
	type Season
} from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

// What holiday rules need to know about the season's weeks.
function calendar(season: Season) {
	const maxRound = Math.max(0, ...seasonMatches(season.id).map((m) => m.round));
	return { startDate: season.startDate ?? '', roundsPerWeek: season.roundsPerWeek, maxRound };
}

export const load: PageServerLoad = ({ params, locals }) => {
	const season = publicSeason(params.slug, locals.user);
	const list = seasonEntries(season.id);
	const player = list.find((e) => e.playerId === params.id) ?? error(404, 'Player not found');
	const hs = seasonHolidays(season.id);
	const { unlocked, away } = seasonUnlocks(season, hs);
	const ctx = cardContext(season, list, locals.user?.id ?? null, new Date(), 0, away);
	const theirs = playerMatches(season.id, player.playerId);
	const ms = published(theirs, season.publishedRound);
	const cards = ms.map((m) => ({
		week: weekOf(m.round, season.roundsPerWeek),
		card: matchCard(m, ctx)
	}));
	const counted = legendMatches(ms, ctx.dropped);
	const standing = groupStandings(season, list).find((g) => g.group === player.group);
	const rank = standing?.rows.findIndex((r) => r.playerId === player.playerId) ?? -1;
	const isMe = locals.user?.id === player.playerId;
	const cal = calendar(season);
	const mine = hs.filter((h) => h.playerId === player.playerId);
	const canRequest = isMe && season.status === 'play';
	// Matches a holiday unlocked before their week: only their two players see them.
	const viewer = locals.user?.id ?? null;
	const early = theirs.filter(
		(m) => !isPublished(m, season.publishedRound) && visibleTo(m, viewer, season, unlocked)
	);

	return {
		season,
		player,
		cosmetics: look(player),
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
		early: early.map((m) => matchCard(m, ctx)),
		legends: playerLegends(counted, player.playerId),
		history: seasonHistory(playerSeasons(player.playerId)),
		// Only the player sees their requests, and the reject reason.
		holidays: isMe
			? mine
					.filter((h) => h.status !== 'cancelled')
					.reverse()
					.map((h) => ({
						id: h.id,
						status: h.status,
						away: dateSpan(h.from, h.to),
						covers: coversLabel(holidayWeeks(h, cal), cal.roundsPerWeek, cal.maxRound),
						reason: h.status === 'rejected' ? h.reason : null
					}))
			: [],
		// The head badge, while this week is one of their approved holiday's weeks.
		away: (() => {
			const h = hs.find(
				(h) =>
					h.playerId === player.playerId &&
					h.status === 'approved' &&
					holidayWeeks(h, { startDate: season.startDate ?? '' }).includes(ctx.week)
			);
			return h ? { dates: dateSpan(h.from, h.to) } : null;
		})(),
		canRequest,
		// For the dialog's live "Covers …" line; the action re-checks everything.
		calendar: canRequest
			? {
					...cal,
					publishedRound: season.publishedRound,
					deadline: season.deadline,
					today: leagueDate(new Date()),
					own: mine.map(({ from, to, status }) => ({ from, to, status }))
				}
			: null,
		// Shows the control only; the action re-checks the role with Discord.
		canErase: !!locals.user?.isOrganizer && !player.former
	};
};

export const actions: Actions = {
	requestHoliday: async (event) => {
		const user = playerAction(event);
		const form = await event.request.formData();
		const season = publicSeason(event.params.slug, user);
		if (event.params.id !== user.id) error(403, 'Only you can ask for your holiday.');
		if (season.status !== 'play')
			return fail(409, { holidayError: 'Holidays are only for the weeks of play.' });
		if (!seasonEntries(season.id).some((e) => e.playerId === user.id))
			error(403, "You're not in this season.");
		const r = { from: String(form.get('from') ?? ''), to: String(form.get('to') ?? '') };
		const cal = calendar(season);
		const own = seasonHolidays(season.id).filter((h) => h.playerId === user.id);
		const problem = requestError(
			r,
			{
				...cal,
				publishedRound: season.publishedRound,
				deadline: season.deadline,
				today: leagueDate(new Date())
			},
			own
		);
		if (problem) return fail(400, { holidayError: problem });
		requestHoliday(season.id, user.id, r);
		postToOrganizers(
			holidayEmbed({
				player: user.displayName,
				dates: dateSpan(r.from, r.to),
				covers: coversLabel(holidayWeeks(r, cal), cal.roundsPerWeek, cal.maxRound),
				where: season.name,
				url: `${event.url.origin}/seasons/${season.slug}/admin/season#holidays`
			})
		);
		return {
			message: `Holiday requested for ${dateSpan(r.from, r.to)}. An organizer will look at it.`
		};
	},

	cancelHoliday: async (event) => {
		const user = playerAction(event);
		const id = Number((await event.request.formData()).get('id'));
		const season = publicSeason(event.params.slug, user);
		if (!cancelHoliday(season.id, id, user.id))
			return fail(409, { message: 'That request is no longer pending.' });
		return { message: 'Request cancelled.' };
	},

	erase: async (event) => {
		const user = await organizerAction(event);
		const season = publicSeason(event.params.slug, user);
		const player = seasonEntries(season.id).find((e) => e.playerId === event.params.id);
		if (!player) error(404, 'Player not found');
		if (player.former) return fail(409, { message: 'This player is already erased.' });
		const typed = String((await event.request.formData()).get('confirm') ?? '').trim();
		if (typed !== player.displayName)
			return fail(400, { message: "Type the player's name to confirm." });
		const { name, dropped, walkovers } = erasePlayer(player.playerId, user.id);
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
		for (const s of walkovers)
			postToOrganizers(
				cutEraseEmbed({
					player: name,
					by: user.displayName,
					where: s.name,
					url: `${event.url.origin}/seasons/${s.slug}/admin/top-cut`
				})
			);
		// Before groups are locked, erasing takes them off the season, so this page is gone.
		if (season.status === 'signup' || season.status === 'groups')
			redirect(303, `/seasons/${season.slug}/admin/players`);
		return { message: `Player erased. Their results now show as ${name}.` };
	}
};
