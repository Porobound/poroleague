import { eq } from 'drizzle-orm';
import { canEquip, SLOTS, type Picks, type Slot } from '#lib/league/cosmetics.ts';
import { db } from '#lib/server/db/index.ts';
import { playerAchievements, players } from '#lib/server/db/schema.ts';

export const ownedAchievements = (playerId: string) =>
	new Set(
		db
			.select({ id: playerAchievements.achievementId })
			.from(playerAchievements)
			.where(eq(playerAchievements.playerId, playerId))
			.all()
			.map((r) => r.id)
	);

// Saves all three slots, or nothing: returns the first slot the player may not fill, else null.
// The caller checks that the player is the one logged in.
export function equip(playerId: string, p: Picks): Slot | null {
	const owned = ownedAchievements(playerId);
	const bad = SLOTS.find((s) => !canEquip(s, p[s], owned));
	if (bad) return bad;
	db.update(players)
		.set({ titleAchievement: p.title, badgeAchievement: p.badge, frameAchievement: p.frame })
		.where(eq(players.id, playerId))
		.run();
	return null;
}
