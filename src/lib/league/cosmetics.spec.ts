import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';
import { canEquip, choices, look, NOTHING, picks } from '#lib/league/cosmetics.ts';

const owned = new Set(['first-blood', 'legend-ahri-gold', 'dice-bronze', 'legend-renamed-bronze']);

describe('canEquip', () => {
	it('allows a title or badge only from owned, known achievements', () => {
		expect(canEquip('title', 'first-blood', owned)).toBe(true);
		expect(canEquip('badge', 'legend-ahri-gold', owned)).toBe(true);
		expect(canEquip('title', 'champion', owned)).toBe(false); // not owned
		expect(canEquip('badge', 'legend-renamed-bronze', owned)).toBe(false); // unknown id
	});

	it('allows a frame only in a tier the player has earned something in', () => {
		expect(canEquip('frame', 'gold', owned)).toBe(true);
		expect(canEquip('frame', 'bronze', owned)).toBe(true);
		expect(canEquip('frame', 'silver', owned)).toBe(false); // nothing silver earned
		expect(canEquip('frame', 'legend-ahri-gold', owned)).toBe(false); // an achievement, not a tier
		expect(canEquip('frame', 'gold', new Set(['first-blood']))).toBe(false); // one-offs have no tier
	});

	it('always allows clearing a slot', () => {
		for (const slot of ['title', 'badge', 'frame'] as const)
			expect(canEquip(slot, null, new Set())).toBe(true);
	});
});

describe('look', () => {
	it('draws nothing when nothing is equipped', () => {
		expect(look(NOTHING)).toEqual({ title: null, badge: null, frame: null });
	});

	it('maps the columns to the title text, the badge and the frame tier', () => {
		expect(
			look({
				titleAchievement: 'legend-ahri-gold',
				badgeAchievement: 'dice-bronze',
				frameTier: 'silver'
			})
		).toEqual({
			title: 'Ahri Master',
			badge: {
				name: 'Dice Player',
				description: 'Win 3 dice rolls.',
				kind: 'rank',
				icon: '/achievements/tiers/bronze.png',
				tier: 'bronze'
			},
			frame: 'silver'
		});
		expect(look({ ...NOTHING, badgeAchievement: 'legend-ahri-gold' }).badge).toMatchObject({
			kind: 'legend',
			tier: 'gold'
		});
		expect(look({ ...NOTHING, badgeAchievement: 'first-blood' }).badge).toMatchObject({
			kind: 'item',
			tier: null
		});
	});

	it('draws nothing for an id no longer in the list or a value that is not a tier', () => {
		expect(
			look({ titleAchievement: 'gone', badgeAchievement: 'gone', frameTier: 'platinum' })
		).toEqual({ title: null, badge: null, frame: null });
	});

	it('reads the columns back as form picks', () => {
		expect(picks({ ...NOTHING, badgeAchievement: 'first-blood', frameTier: 'gold' })).toEqual({
			title: null,
			badge: 'first-blood',
			frame: 'gold'
		});
	});
});

describe('choices', () => {
	it('offers only earned achievements, in list order and grouped; frames are the earned tiers', () => {
		const c = choices(owned);
		expect(c.titles.map((o) => o.id)).toEqual(
			ACHIEVEMENTS.filter((a) => owned.has(a.id)).map((a) => a.id)
		);
		expect(c.badges.map((o) => [o.label, o.group])).toEqual([
			['Ahri Master', 'Legends'],
			['Dice Player', 'League'],
			['First Blood', 'One-offs']
		]);
		expect(c.badges[2].badge.icon).toBe('/achievements/items/first-blood.png');
		expect(c.frames).toEqual(['bronze', 'gold']);
	});

	it('is empty for a player with nothing earned', () => {
		expect(choices(new Set())).toEqual({ titles: [], badges: [], frames: [] });
	});
});
