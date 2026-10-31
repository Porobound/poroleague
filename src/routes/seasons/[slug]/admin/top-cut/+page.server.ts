import { error, fail } from '@sveltejs/kit';
import { championEmbed, pairingsPost, walkoverEmbed } from '#lib/discord.ts';
import { matchName, roundName } from '#lib/league/bracket.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { adminRows, getMatch } from '#lib/server/matches.ts';
import { playerNames } from '#lib/server/players.ts';
import { editResult, keepFlag } from '#lib/server/resultActions.ts';
import { getSeason, seasonEntries } from '#lib/server/seasons.ts';
import {
	cutPreview,
	cutRounds,
	cutState,
	finishCut,
	publishCut,
	waitingOnFlag,
	walkover
} from '#lib/server/topCut.ts';
import { pairingsEnabled, postPairings, postResult } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	if (season.status !== 'topcut' && season.status !== 'finished') error(404, 'No top cut yet');
	const s = cutState(season);
	const rounds = s.rounds.length;
	const people = seasonEntries(season.id);
	return {
		published: s.published,
		preview: s.published ? null : cutPreview(season),
		champion: s.champion && people.find((e) => e.playerId === s.champion)!.displayName,
		openFlags: s.rounds.flat().some((x) => x.match?.flaggedBy && !x.match.flagResolvedAt),
		rounds: s.rounds.map((r, i) => {
			const ms = r.flatMap((x) => (x.match ? [x.match] : []));
			return {
				name: roundName(i + 1, rounds),
				rows: adminRows(season, people, ms, rounds).map((row, j) => ({
					...row,
					walkoverOpen: season.status === 'topcut' && !ms[j].reportedBy && !ms[j].walkoverId,
					higher: s.seeds.get(row.p1.id)! < s.seeds.get(row.p2.id)! ? row.p1.id : row.p2.id
				}))
			};
		}),
		discord: pairingsEnabled()
	};
};

async function inCut(event: RequestEvent) {
	const user = await organizerAction(event);
	const form = await event.request.formData();
	const season = getSeason(event.params.slug, user);
	return { user, form, season: season.status === 'topcut' ? season : null };
}

export const actions: Actions = {
	edit: editResult,
	keep: keepFlag,

	publish: async (event) => {
		const { user, form, season } = await inCut(event);
		if (!season) return fail(409, { message: 'The season is not in its top cut.' });
		if (cutState(season).published)
			return fail(409, { message: 'The top cut is already published.' });
		const date = String(form.get('date') ?? '');
		if (date && !DATE.test(date)) return fail(400, { message: 'Pick a date, or leave it empty.' });
		const preview = cutPreview(season);
		if (preview.problem) return fail(400, { message: preview.problem });
		publishCut(season, date || null, user.id, preview);
		const s = cutState(season);
		const discord = pairingsEnabled();
		if (discord) {
			const pairs = s.rounds[0]
				.filter((x) => x.match)
				.map((x) => ({ group: null, p1Id: x.p1!, p2Id: x.p2! }));
			const body = pairingsPost(
				`${season.name} · Top cut${date ? ` · ${date}` : ''}`,
				`${event.url.origin}/seasons/${season.slug}/top-cut`,
				[{ round: 1, name: roundName(1, s.rounds.length), pairs }],
				playerNames(pairs.flatMap((p) => [p.p1Id, p.p2Id]))
			);
			const names = new Map(seasonEntries(season.id).map((e) => [e.playerId, e.displayName]));
			const byes = s.rounds[0].filter((x) => x.bye).map((x) => names.get(x.winner!)!);
			if (byes.length) body.content += `\nByes: ${byes.join(', ')}`;
			postPairings(body);
		}
		return { message: `Top cut published${discord ? ' and posted in Discord' : ''}.` };
	},

	walkover: async (event) => {
		const { user, form, season } = await inCut(event);
		if (!season) return fail(409, { message: 'The season is not in its top cut.' });
		const match = getMatch(season.id, Number(form.get('matchId')));
		const winnerId = String(form.get('winnerId'));
		if (!match || match.stage !== 'playoff') error(404, 'Match not found');
		if (match.reportedBy || match.walkoverId)
			return fail(409, { message: 'This match already has a result.' });
		if (winnerId !== match.p1Id && winnerId !== match.p2Id)
			return fail(400, { message: 'Pick one of the two players.' });
		if (waitingOnFlag(season, match))
			return fail(409, { message: 'Settle the flagged result before this match first.' });
		walkover(season, match, winnerId, user.id);
		const name = seasonEntries(season.id).find((e) => e.playerId === winnerId)!.displayName;
		postResult(
			walkoverEmbed(
				`${season.name} · Top cut · ${matchName(match.round, match.slot ?? 0, cutRounds(season.id))}`,
				name,
				`${event.url.origin}/seasons/${season.slug}/matches/${match.id}`
			)
		);
		return { message: `${name} advances.` };
	},

	finish: async (event) => {
		const { user, season } = await inCut(event);
		if (!season) return fail(409, { message: 'The season is not in its top cut.' });
		const s = cutState(season);
		if (!s.champion) return fail(409, { message: 'The final has no result yet.' });
		if (s.rounds.flat().some((x) => x.match?.flaggedBy && !x.match.flagResolvedAt))
			return fail(409, { message: 'Resolve the flagged top-cut results first.' });
		finishCut(season, s.champion, user.id);
		const name = seasonEntries(season.id).find((e) => e.playerId === s.champion)!.displayName;
		postResult(
			championEmbed(season.name, name, `${event.url.origin}/seasons/${season.slug}/top-cut`)
		);
		return { message: `${season.name} is finished. ${name} is the champion.` };
	}
};
