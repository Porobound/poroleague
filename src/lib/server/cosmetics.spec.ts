import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { playerAchievements, players } from '#lib/server/db/schema.ts';
import { equip, ownedAchievements } from '#lib/server/cosmetics.ts';
import { seedPlayers } from '#lib/server/test/seed.ts';

const earn = (playerId: string, ids: string[]) =>
	db
		.insert(playerAchievements)
		.values(
			ids.map((achievementId) => ({
				playerId,
				achievementId,
				unlockedAt: new Date(),
				seasonId: null
			}))
		)
		.run();
const slots = (id: string) => {
	const p = db.select().from(players).where(eq(players.id, id)).get()!;
	return [p.titleAchievement, p.badgeAchievement, p.frameTier];
};

describe('equip', () => {
	it('saves owned achievements in all three slots', () => {
		seedPlayers(2);
		earn('p1', ['first-blood', 'legend-ahri-gold']);
		expect(ownedAchievements('p1')).toEqual(new Set(['first-blood', 'legend-ahri-gold']));
		expect(
			equip('p1', {
				title: 'legend-ahri-gold',
				badge: 'first-blood',
				frame: 'gold'
			})
		).toBeNull();
		expect(slots('p1')).toEqual(['legend-ahri-gold', 'first-blood', 'gold']);
		expect(slots('p2')).toEqual([null, null, null]);
	});

	it('refuses an achievement the player does not own, saving nothing', () => {
		seedPlayers(2);
		earn('p1', ['first-blood']);
		earn('p2', ['champion']);
		expect(equip('p1', { title: 'first-blood', badge: 'champion', frame: null })).toBe('badge');
		expect(slots('p1')).toEqual([null, null, null]);
	});

	it('refuses a frame in a tier the player has nothing in, and unknown ids', () => {
		seedPlayers(1);
		earn('p1', ['first-blood', 'legend-renamed-bronze']);
		expect(equip('p1', { title: null, badge: null, frame: 'gold' })).toBe('frame');
		expect(equip('p1', { title: 'legend-renamed-bronze', badge: null, frame: null })).toBe('title');
	});

	it('clears a slot', () => {
		seedPlayers(1);
		earn('p1', ['first-blood']);
		equip('p1', { title: 'first-blood', badge: 'first-blood', frame: null });
		expect(equip('p1', { title: null, badge: 'first-blood', frame: null })).toBeNull();
		expect(slots('p1')).toEqual([null, 'first-blood', null]);
	});
});
