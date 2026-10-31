import { randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { escapeMd } from '#lib/discord.ts';
import { db } from '#lib/server/db/index.ts';
import { setPlayerRoles } from '#lib/server/discord.ts';
import { audit, entries, matches, players, seasons, sessions } from '#lib/server/db/schema.ts';
import { dropPlayer } from '#lib/server/seasons.ts';

export const newPlayerId = () => randomBytes(8).toString('hex');

// Embed text per player: the escaped display name. Mentions in embeds render as raw ids for
// members the viewer's client hasn't cached, and never ping anyway.
export function playerNames(ids: string[]) {
	const rows = db.select().from(players).where(inArray(players.id, ids)).all();
	const by = new Map(rows.map((p) => [p.id, escapeMd(p.displayName)]));
	return (id: string) => by.get(id) ?? 'Unknown';
}

// GDPR erasure: the player stays as "Former player 3f9a" so results and standings don't change,
// but their Discord link, name, avatar, logins and flag reasons go. One audit row per season.
export function erasePlayer(playerId: string, actorId: string) {
	const { discordId, ...erased } = db.transaction((tx) => {
		const p = tx.select().from(players).where(eq(players.id, playerId)).get();
		if (!p || p.erasedAt) throw new Error(`No player ${playerId} to erase`);
		// A random suffix tells former players apart without depending on the order of erasures.
		let name: string;
		do name = `Former player ${randomBytes(2).toString('hex')}`;
		while (tx.select().from(players).where(eq(players.displayName, name)).get());
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
		// They can't play on: off the list before groups are locked, dropped (matches void) in play.
		// In the top cut a drop would rewrite the seeding standings, so they stay: they can't qualify,
		// and once the bracket is out an organizer walks their match over.
		const theirs = tx
			.select({
				id: seasons.id,
				name: seasons.name,
				slug: seasons.slug,
				status: seasons.status,
				dropped: entries.dropped,
				slot: entries.slot
			})
			.from(entries)
			.innerJoin(seasons, eq(entries.seasonId, seasons.id))
			.where(and(eq(entries.playerId, playerId), isNull(seasons.deletedAt)))
			.all();
		// Seasons in play they were dropped from, for the organizers' Discord notice.
		const dropped: { name: string; slug: string }[] = [];
		// Top cuts with a published bracket they're in: organizers walk their open match over.
		const walkovers: { name: string; slug: string }[] = [];
		for (const s of theirs) {
			const entry = and(eq(entries.seasonId, s.id), eq(entries.playerId, playerId));
			if (s.status === 'signup' || s.status === 'groups') {
				tx.delete(entries).where(entry).run();
				continue;
			}
			if (s.status === 'play' && !s.dropped) {
				dropPlayer(s.id, playerId, actorId, tx);
				dropped.push({ name: s.name, slug: s.slug });
			}
			if (s.status === 'topcut' && s.slot !== null) walkovers.push({ name: s.name, slug: s.slug });
			tx.insert(audit)
				.values({ seasonId: s.id, actorId, action: 'erase', after: { erased: playerId } })
				.run();
		}
		return { name, dropped, walkovers, discordId: p.discordId };
	});
	// Only once the erasure is saved: the Discord id is gone from the DB by now.
	if (discordId) void setPlayerRoles([[discordId, false]]);
	return erased;
}
