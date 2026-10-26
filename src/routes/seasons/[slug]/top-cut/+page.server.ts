import { error } from '@sveltejs/kit';
import { roundName } from '#lib/league/bracket.ts';
import { cardContext, matchCard } from '#lib/matchCard.ts';
import { publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import { cutRounds, cutState } from '#lib/server/topCut.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const season = publicSeason(params.slug, locals.user);
	const s = cutState(season);
	if (!s.published) error(404, 'No top cut yet');
	const people = seasonEntries(season.id);
	const me = locals.user?.id ?? null;
	const rounds = cutRounds(season.id);
	const ctx = cardContext(season, people, me, new Date(), rounds);
	const who = (id: string | null) => {
		const e = id && people.find((x) => x.playerId === id);
		return e
			? { id: e.playerId, name: e.displayName, former: e.former, label: s.label(e.playerId) }
			: null;
	};
	const now = s.rounds.findIndex((r) => r.some((x) => !x.bye && !x.winner));
	return {
		season,
		champion: who(s.champion),
		now,
		rounds: s.rounds.map((r, i) => ({
			name: roundName(i + 1, rounds),
			slots: r.map((x) => ({
				p1: who(x.p1),
				p2: who(x.p2),
				bye: x.bye,
				winner: x.winner,
				games: x.match && x.match.reportedBy ? [x.match.p1Games, x.match.p2Games] : null,
				level: !!x.match?.reportedBy && x.match.p1Games === x.match.p2Games,
				walkover: !!x.match?.walkoverId,
				mine: !!me && (x.p1 === me || x.p2 === me),
				href: x.match ? `/seasons/${season.slug}/matches/${x.match.id}` : null,
				card: x.match ? matchCard(x.match, ctx) : null
			}))
		}))
	};
};
