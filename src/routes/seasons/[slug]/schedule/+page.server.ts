import { published } from '#lib/league/publish.ts';
import { weekOf } from '#lib/league/time.ts';
import { cardContext, matchCard, type Card } from '#lib/matchCard.ts';
import { groupName } from '#lib/season.ts';
import { seasonMatches } from '#lib/server/matches.ts';
import { publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	const ctx = cardContext(season, seasonEntries(season.id), locals.user?.id ?? null);
	const all = seasonMatches(season.id);
	const rpw = season.roundsPerWeek;
	const maxRound = Math.max(0, ...all.map((m) => m.round));
	const weeks = weekOf(maxRound, rpw);
	const shownWeeks = weekOf(season.publishedRound, rpw);
	const asked = Number(url.searchParams.get('week'));
	const week = Math.min(
		weeks,
		Math.max(1, Number.isInteger(asked) && asked > 0 ? asked : Math.min(ctx.week, shownWeeks))
	);
	const groups = Math.max(0, ...all.map((m) => m.group ?? 0));
	const group = Number(url.searchParams.get('group')) || 0;
	const mine = !!locals.user && url.searchParams.has('mine');

	const cards = published(all, season.publishedRound)
		.filter((m) => !group || m.group === group)
		.map((m) => ({ m, card: matchCard(m, ctx) }));
	const show = (c: Card) => !mine || c.mine;

	const sections = new Map<string, Card[]>();
	for (const { m, card } of cards) {
		if (weekOf(m.round, rpw) !== week) continue;
		const title = card.props.head;
		sections.set(title, [...(sections.get(title) ?? []), card]);
	}

	return {
		season,
		week,
		currentWeek: ctx.week,
		published: shownWeeks,
		weeks: Array.from({ length: weeks }, (_, i) => {
			const first = i * rpw + 1;
			const last = Math.min((i + 1) * rpw, maxRound);
			return { n: i + 1, label: `Week ${i + 1} · R${first}${last > first ? `–${last}` : ''}` };
		}),
		groups: Array.from({ length: groups }, (_, i) => ({ n: i + 1, label: groupName(i + 1) })),
		group,
		mine,
		// Overdue matches sit in their own week's rounds too, so list them separately only on the current week.
		overdue:
			week === ctx.week
				? cards.map((c) => c.card).filter((c) => c.status === 'overdue' && show(c))
				: [],
		sections: [...sections].map(([title, list]) => {
			const count = (s: string) => list.filter((c) => c.status === s).length;
			const voids = count('void');
			return {
				title,
				total: list.length - voids,
				done: count('reported') + count('flagged'),
				flagged: count('flagged'),
				voids,
				cards: list.filter(show).sort((a, b) => Number(b.mine) - Number(a.mine))
			};
		})
	};
};
