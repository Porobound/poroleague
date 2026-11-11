import { LEGENDS, type Legend } from '#lib/legends.ts';

export type Tier = 'bronze' | 'silver' | 'gold';

// One achievement, for the career page and for cosmetics (#143). Rows store `id`: never rename one.
// A tiered id ends in its tier, not its name, so a tier can be renamed.
export type Achievement = {
	id: string;
	track: string; // the tiers of one track read as a progression; a one-off is its own track
	tier: Tier | null; // null for a one-off
	name: string;
	description: string;
	title: string; // shown with the player's name when equipped (#143)
	icon: string; // under static/
	legend: Legend | null; // legend tracks only
	need: number; // hits to unlock
};

export type Hit = { at: Date; seasonId: number };
// Filled in by Task 3.
type Hits = (ms: unknown[], h: unknown) => Hit[];
type Def = Achievement & { hits: Hits };

export const key = (s: string) =>
	s
		.toLowerCase()
		.replace(/'/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
export const champion = (legend: string) => legend.replace(/ \((PG|XP)\)$/, '');
export const emblem = (t: Tier) => `/achievements/tiers/${t}.png`;
export const crest = (t: Tier) => `/achievements/tiers/${t}.svg`;

const TIERS = ['bronze', 'silver', 'gold'] as const;
type Three<T> = [T, T, T];
// Most tracks name their tiers after the track: "Ahri Player", "Ahri Expert", "Ahri Master".
const levels = (label: string): Three<string> => [
	`${label} Player`,
	`${label} Expert`,
	`${label} Master`
];

function tiered(
	track: string,
	names: Three<string>,
	describe: (n: number) => string,
	needs: Three<number>,
	hits: Hits,
	icon: (t: Tier) => string,
	legend: Legend | null = null
): Def[] {
	return TIERS.map((tier, i) => ({
		id: `${track}-${tier}`,
		track,
		tier,
		name: names[i],
		description: describe(needs[i]),
		title: names[i],
		icon: icon(tier),
		legend,
		need: needs[i],
		hits
	}));
}

const flat = (id: string, name: string, description: string, hits: Hits): Def => ({
	id,
	track: id,
	tier: null,
	name,
	description,
	title: name,
	icon: `/achievements/items/${id}.png`,
	legend: null,
	need: 1,
	hits
});

const none: Hits = () => [];

const DEFS: Def[] = [
	...LEGENDS.flatMap((l) =>
		tiered(
			`legend-${key(l)}`,
			levels(l),
			(n) => `Play ${n} matches as ${l}.`,
			[3, 10, 25],
			none,
			() => `/achievements/champions/${key(champion(l))}.png`,
			l
		)
	),
	...tiered(
		'variety',
		levels('Variety'),
		(n) => `Play at least 2 matches each with ${n} different legends.`,
		[3, 5, 10],
		none,
		emblem
	),
	...tiered('dice', levels('Dice'), (n) => `Win ${n} dice rolls.`, [3, 6, 20], none, emblem),
	...tiered(
		'seasons',
		['Veteran', 'Old Guard', 'Elder'],
		(n) => `Play in ${n} seasons.`,
		[2, 5, 10],
		none,
		() => '/achievements/items/seasons.png'
	),
	...tiered(
		'comeback',
		['Comeback Kid', 'Comeback King', 'Comeback Emperor'],
		(n) => (n === 1 ? 'Win a match after losing game 1.' : `Win ${n} matches after losing game 1.`),
		[1, 5, 15],
		none,
		() => '/achievements/items/comeback.png'
	),
	flat('first-blood', 'First Blood', 'Win your first match.', none),
	flat('perfect-group', 'Perfect Group', 'Win every group match of a season.', none),
	flat('top-cut', 'Top Cut', 'Reach a top cut.', none),
	flat('champion', 'Champion', 'Win a top-cut final.', none)
];

export const ACHIEVEMENTS: readonly Achievement[] = DEFS;
export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
