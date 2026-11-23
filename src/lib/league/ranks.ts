// The rank ladder, lowest first. Achievements use all of it; legend mastery starts at bronze.
export const RANKS = [
	'wood',
	'bronze',
	'silver',
	'gold',
	'platinum',
	'emerald',
	'diamond',
	'master',
	'grandmaster',
	'challenger'
] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_NAME: Record<Rank, string> = {
	wood: 'Wood',
	bronze: 'Bronze',
	silver: 'Silver',
	gold: 'Gold',
	platinum: 'Platinum',
	emerald: 'Emerald',
	diamond: 'Diamond',
	master: 'Master',
	grandmaster: 'Grandmaster',
	challenger: 'Challenger'
};

export const isRank = (v: unknown): v is Rank => RANKS.includes(v as Rank);
// Positive when a outranks b.
export const compareRank = (a: Rank, b: Rank) => RANKS.indexOf(a) - RANKS.indexOf(b);
