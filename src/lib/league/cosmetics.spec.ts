import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';
import { canEquip, choices, look, NOTHING, picks } from '#lib/league/cosmetics.ts';

const owned = new Set([
	'first-blood',
	'legend-ahri-master',
	'dice-player',
	'legend-renamed-player'
]);

describe('canEquip', () => {
	it('allows only owned, known achievements; frames need a tier', () => {
		expect(canEquip('title', 'first-blood', owned)).toBe(true);
		expect(canEquip('badge', 'legend-ahri-master', owned)).toBe(true);
		expect(canEquip('frame', 'legend-ahri-master', owned)).toBe(true);
		expect(canEquip('frame', 'first-blood', owned)).toBe(false); // one-off: no tier
		expect(canEquip('title', 'champion', owned)).toBe(false); // not owned
		expect(canEquip('badge', 'legend-renamed-player', owned)).toBe(false); // unknown id
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

	it('maps ids to the title text, badge icon and frame tier', () => {
		expect(
			look({
				titleAchievement: 'legend-ahri-master',
				badgeAchievement: 'first-blood',
				frameAchievement: 'dice-player'
			})
		).toEqual({
			title: { text: 'Ahri Master', tier: 'gold' },
			badge: { name: 'First Blood', icon: '/achievements/items/first-blood.png', tier: null },
			frame: 'bronze'
		});
	});

	it('draws nothing for an id no longer in the list', () => {
		expect(
			look({ titleAchievement: 'gone', badgeAchievement: 'gone', frameAchievement: 'gone' })
		).toEqual({ title: null, badge: null, frame: null });
	});

	it('reads the columns back as form picks', () => {
		expect(picks({ ...NOTHING, badgeAchievement: 'first-blood' })).toEqual({
			title: null,
			badge: 'first-blood',
			frame: null
		});
	});
});

describe('choices', () => {
	it('offers only earned achievements, in list order; frames best tier first', () => {
		const c = choices(owned);
		expect(c.titles.map((o) => o.id)).toEqual(
			ACHIEVEMENTS.filter((a) => owned.has(a.id)).map((a) => a.id)
		);
		expect(c.badges.find((o) => o.id === 'first-blood')).toEqual({
			id: 'first-blood',
			label: 'First Blood',
			tier: null,
			icon: '/achievements/items/first-blood.png'
		});
		expect(c.frames.map((o) => o.label)).toEqual(['Gold · Ahri Master', 'Bronze · Dice Player']);
	});

	it('is empty for a player with nothing earned', () => {
		expect(choices(new Set())).toEqual({ titles: [], badges: [], frames: [] });
	});
});
