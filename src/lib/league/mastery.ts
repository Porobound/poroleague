import { champion, key, played, type History, type Hit } from '#lib/league/achievements.ts';
import { RANKS, type Rank } from '#lib/league/ranks.ts';
import { LEGENDS, type Legend } from '#lib/legends.ts';

// Legend mastery: a rank per legend from the matches played as it, bronze to challenger. Derived
// from the same counted matches as achievements (`played`), never stored. Matches, not wins.
export const MASTERY_RANKS = RANKS.slice(1);
// Matches needed for each rank, in MASTERY_RANKS order.
export const MASTERY_NEEDS = [3, 7, 12, 20, 30, 45, 60, 80, 100] as const;

export type Mastery = {
	legend: Legend;
	matches: number; // every counted match as the legend; keeps counting past the top rank
	rank: Rank | null; // null until the first threshold
	hit: Hit | null; // the match that reached `rank`
	next: { rank: Rank; need: number } | null; // null at the top rank
};

// One entry per legend, in LEGENDS order, played or not.
export function mastery(h: History): Mastery[] {
	const dates = new Map<string, Hit[]>();
	for (const m of played(h)) {
		if (!m.legend) continue;
		const list = dates.get(m.legend) ?? [];
		list.push({ at: m.at, seasonId: m.seasonId });
		dates.set(m.legend, list);
	}
	return LEGENDS.map((legend) => {
		const hits = dates.get(legend) ?? [];
		const level = MASTERY_NEEDS.filter((need) => hits.length >= need).length;
		return {
			legend,
			matches: hits.length,
			rank: level ? MASTERY_RANKS[level - 1] : null,
			hit: level ? hits[MASTERY_NEEDS[level - 1] - 1] : null,
			next:
				level < MASTERY_NEEDS.length
					? { rank: MASTERY_RANKS[level], need: MASTERY_NEEDS[level] }
					: null
		};
	});
}

// A legend's portrait: its champion's, whichever set the legend is from.
export const portrait = (legend: Legend) => `/achievements/champions/${key(champion(legend))}.png`;
