import {
	ACHIEVEMENTS,
	achievementById,
	type Achievement,
	type Tier
} from '#lib/league/achievements.ts';

// Profile cosmetics: each slot holds the id of an achievement the player earned. Earned rows are
// never removed, so an equipped item stays valid.
export const SLOTS = ['title', 'badge', 'frame'] as const;
export type Slot = (typeof SLOTS)[number];
export type Picks = Record<Slot, string | null>;
// The players columns, as seasonEntries selects them.
export type Equipped = {
	titleAchievement: string | null;
	badgeAchievement: string | null;
	frameAchievement: string | null;
};
export const NOTHING: Equipped = {
	titleAchievement: null,
	badgeAchievement: null,
	frameAchievement: null
};

export const picks = (e: Equipped): Picks => ({
	title: e.titleAchievement,
	badge: e.badgeAchievement,
	frame: e.frameAchievement
});

// null clears the slot. Otherwise the player must own a known achievement; a frame needs a tier.
export function canEquip(slot: Slot, id: string | null, owned: ReadonlySet<string>) {
	if (id === null) return true;
	const a = achievementById.get(id);
	return !!a && owned.has(id) && (slot !== 'frame' || a.tier !== null);
}

export type Badge = { name: string; icon: string; tier: Tier | null };
export type Look = {
	title: { text: string; tier: Tier | null } | null;
	badge: Badge | null;
	frame: Tier | null;
};

// What pages draw. An id no longer in the list (a renamed legend) draws nothing.
export function look(e: Equipped): Look {
	const get = (id: string | null) => (id ? achievementById.get(id) : undefined);
	const [t, b, f] = [get(e.titleAchievement), get(e.badgeAchievement), get(e.frameAchievement)];
	return {
		title: t ? { text: t.title, tier: t.tier } : null,
		badge: b ? { name: b.name, icon: b.icon, tier: b.tier } : null,
		frame: f?.tier ?? null
	};
}

export type Option = { id: string; label: string; tier: Tier | null; icon: string };
export type Choices = Record<'titles' | 'badges' | 'frames', Option[]>;
const TIER_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;
const RANK = { gold: 0, silver: 1, bronze: 2 } as const;

// The Customize selects: only what the player earned, in list order; frames best tier first.
export function choices(owned: ReadonlySet<string>): Choices {
	const mine = ACHIEVEMENTS.filter((a) => owned.has(a.id));
	const opt = (a: Achievement, label: string): Option => ({
		id: a.id,
		label,
		tier: a.tier,
		icon: a.icon
	});
	return {
		titles: mine.map((a) => opt(a, a.title)),
		badges: mine.map((a) => opt(a, a.name)),
		frames: mine
			.filter((a) => a.tier)
			.sort((x, y) => RANK[x.tier!] - RANK[y.tier!])
			.map((a) => opt(a, `${TIER_NAME[a.tier!]} · ${a.name}`))
	};
}
