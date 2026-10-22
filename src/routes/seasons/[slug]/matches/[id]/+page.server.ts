import { error, fail } from '@sveltejs/kit';
import { LEGENDS } from '#lib/legends.ts';
import { matchMode, parseReport, resultLine } from '#lib/league/report.ts';
import { reportingClosed } from '#lib/league/time.ts';
import { playerAction } from '#lib/server/auth.ts';
import {
	flagMatch,
	getMatch,
	isVoided,
	lastLegend,
	matchPlayers,
	saveReport
} from '#lib/server/matches.ts';
import { getSeason } from '#lib/server/seasons.ts';
import { postResult, postToOrganizers } from '#lib/server/webhooks.ts';
import type { Actions, PageServerLoad } from './$types';

type Event = { params: { slug: string; id: string }; locals: App.Locals };

// Everything an action checks, read in one go. Actions call it after awaiting the form, with no
// await between this and the write, so two requests can't interleave.
function context({ params, locals }: Event) {
	const season = getSeason(params.slug, locals.user);
	const id = Number(params.id);
	const match = Number.isInteger(id) ? getMatch(season.id, id) : undefined;
	if (!match) error(404, 'Match not found');
	const closed = reportingClosed(season.deadline, new Date());
	const voided = isVoided(match);
	const mode = matchMode(match, {
		viewerId: locals.user?.id ?? null,
		inPlay: season.status === 'play',
		closed,
		voided
	});
	return { season, match, mode, closed, voided };
}

const named = (p: { id: string; displayName: string }) => ({ id: p.id, name: p.displayName });

export const load: PageServerLoad = (event) => {
	const { season, match, mode, closed, voided } = context(event);
	const [p1, p2] = matchPlayers(match);
	return {
		season,
		match,
		mode,
		closed,
		voided,
		p1,
		p2,
		legends: LEGENDS,
		prefill: {
			p1Legend: match.p1Legend ?? lastLegend(match.p1Id) ?? '',
			p2Legend: match.p2Legend ?? lastLegend(match.p2Id) ?? ''
		}
	};
};

export const actions: Actions = {
	report: async (event) => {
		const user = playerAction(event);
		const form = await event.request.formData();
		const { match, mode } = context(event);
		if (mode !== 'report')
			return fail(409, { error: true, message: 'This match is already reported or closed.' });
		const parsed = parseReport(form, match.p1Id, match.p2Id);
		if (!parsed.ok)
			return fail(400, {
				errors: parsed.errors,
				values: Object.fromEntries(form) as Record<string, string>
			});
		saveReport(match, user.id, parsed.values);
		const [p1, p2] = matchPlayers(match);
		postResult(resultLine(named(p1), named(p2), parsed.values));
		const opponent = user.id === p1.id ? p2 : p1;
		return {
			message: `Result saved. If something's off, you or ${opponent.displayName} can flag it.`
		};
	},

	flag: async (event) => {
		const user = playerAction(event);
		const reason = String((await event.request.formData()).get('reason') ?? '').trim();
		if (!reason || reason.length > 500)
			return fail(400, { flagError: "Say what's wrong (up to 500 characters)." });

		const { season, match, mode } = context(event);
		if (mode !== 'flag') return fail(409, { error: true, message: "You can't flag this result." });
		flagMatch(match, user.id, reason);
		const [p1, p2] = matchPlayers(match);
		const line = resultLine(named(p1), named(p2), {
			p1Games: match.p1Games!,
			p2Games: match.p2Games!,
			p1Legend: match.p1Legend!,
			p2Legend: match.p2Legend!,
			diceWinnerId: match.diceWinnerId!
		});
		postToOrganizers(
			`Flag: ${user.displayName} flagged ${line}: "${reason}" ${event.url.origin}/seasons/${season.slug}/matches/${match.id}`
		);
		return { message: 'Flagged. An organizer will take a look.' };
	}
};
