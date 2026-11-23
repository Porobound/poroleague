import {
	ACHIEVEMENTS,
	achievementById,
	kind,
	type Achievement,
	type Kind,
	type Tier
} from '#lib/league/achievements.ts';

// Profile cosmetics. The title and the badge are an achievement the player earned; the frame is a
// tier they have earned something in. Earned rows are never removed, so an equipped item stays valid.
export const SLOTS = ['title', 'badge', 'frame'] as const;
export type Slot = (typeof SLOTS)[number];
export type Picks = Record<Slot, string | null>;
// The players columns, as seasonEntries selects them.
export type Equipped = {
	titleAchievement: string | null;
	badgeAchievement: string | null;
	frameTier: string | null;
};
export const NOTHING: Equipped = {
	titleAchievement: null,
	badgeAchievement: null,
	frameTier: null
};

export const picks = (e: Equipped): Picks => ({
	title: e.titleAchievement,
	badge: e.badgeAchievement,
	frame: e.frameTier
});

const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];
const isTier = (v: string | null): v is Tier => TIERS.includes(v as Tier);
const earned = (owned: ReadonlySet<string>) => ACHIEVEMENTS.filter((a) => owned.has(a.id));

// null clears the slot. A title or badge must be a known achievement the player owns; a frame must
// be a tier they own an achievement of.
export function canEquip(slot: Slot, value: string | null, owned: ReadonlySet<string>) {
	if (value === null) return true;
	if (slot === 'frame') return isTier(value) && earned(owned).some((a) => a.tier === value);
	return achievementById.has(value) && owned.has(value);
}

export type Badge = {
	name: string;
	description: string;
	kind: Kind;
	icon: string;
	tier: Tier | null;
};
export type Look = { title: string | null; badge: Badge | null; frame: Tier | null };
const badge = (a: Achievement): Badge => ({
	name: a.name,
	description: a.description,
	kind: kind(a),
	icon: a.icon,
	tier: a.tier
});

// What pages draw. An id no longer in the list (a renamed legend) draws nothing.
export function look(e: Equipped): Look {
	const get = (id: string | null) => (id ? achievementById.get(id) : undefined);
	const b = get(e.badgeAchievement);
	return {
		title: get(e.titleAchievement)?.title ?? null,
		badge: b ? badge(b) : null,
		frame: isTier(e.frameTier) ? e.frameTier : null
	};
}

export const GROUPS = ['Legends', 'League', 'One-offs'] as const;
export type Option = { id: string; label: string; group: (typeof GROUPS)[number]; badge: Badge };
export type Choices = { titles: Option[]; badges: Option[]; frames: Tier[] };

// The Customize pickers: only what the player earned, in list order, grouped as on the career page.
export function choices(owned: ReadonlySet<string>): Choices {
	const mine = earned(owned);
	const opt = (a: Achievement, label: string): Option => ({
		id: a.id,
		label,
		group: a.legend ? 'Legends' : a.tier ? 'League' : 'One-offs',
		badge: badge(a)
	});
	return {
		titles: mine.map((a) => opt(a, a.title)),
		badges: mine.map((a) => opt(a, a.name)),
		frames: TIERS.filter((t) => mine.some((a) => a.tier === t))
	};
}
