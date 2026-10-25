import { randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { escapeMd } from '#lib/discord.ts';
import { db } from '#lib/server/db/index.ts';
import { players } from '#lib/server/db/schema.ts';

export const newPlayerId = () => randomBytes(8).toString('hex');

// Embed text per player: a Discord mention, or the plain name once erased (or never linked).
export function discordMentions(ids: string[]) {
	const rows = db.select().from(players).where(inArray(players.id, ids)).all();
	const by = new Map(
		rows.map((p) => [p.id, p.discordId ? `<@${p.discordId}>` : escapeMd(p.displayName)])
	);
	return (id: string) => by.get(id) ?? 'Unknown';
}
