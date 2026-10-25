import { randomBytes } from 'node:crypto';
import { and, count, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { escapeMd } from '#lib/discord.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, players, sessions } from '#lib/server/db/schema.ts';

export const newPlayerId = () => randomBytes(8).toString('hex');

// Embed text per player: a Discord mention, or the plain name once erased (or never linked).
export function discordMentions(ids: string[]) {
	const rows = db.select().from(players).where(inArray(players.id, ids)).all();
	const by = new Map(
		rows.map((p) => [p.id, p.discordId ? `<@${p.discordId}>` : escapeMd(p.displayName)])
	);
	return (id: string) => by.get(id) ?? 'Unknown';
}

// GDPR erasure: the player stays as "Former player N" so results and standings don't change,
// but their Discord link, name, avatar, logins and flag reasons go. One audit row per season.
export function erasePlayer(playerId: string, actorId: string) {
	return db.transaction((tx) => {
		const p = tx.select().from(players).where(eq(players.id, playerId)).get();
		if (!p || p.erasedAt) throw new Error(`No player ${playerId} to erase`);
		const [{ n }] = tx
			.select({ n: count() })
			.from(players)
			.where(isNotNull(players.erasedAt))
			.all();
		const name = `Former player ${n + 1}`;
		tx.update(players)
			.set({ displayName: name, avatar: null, discordId: null, erasedAt: new Date() })
			.where(eq(players.id, playerId))
			.run();
		tx.delete(sessions).where(eq(sessions.playerId, playerId)).run();
		tx.update(matches).set({ flagReason: null }).where(eq(matches.flaggedBy, playerId)).run();
		tx.update(audit)
			.set({ after: sql`json_remove(${audit.after}, '$.flagReason')` })
			.where(and(eq(audit.actorId, playerId), eq(audit.action, 'flag')))
			.run();
		const seasonIds = tx
			.select({ id: entries.seasonId })
			.from(entries)
			.where(eq(entries.playerId, playerId))
			.all();
		for (const { id } of seasonIds)
			tx.insert(audit)
				.values({ seasonId: id, actorId, action: 'erase', after: { erased: playerId } })
				.run();
		return name;
	});
}
