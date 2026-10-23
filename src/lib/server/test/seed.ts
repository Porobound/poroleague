import { db } from '#lib/server/db/index.ts';
import { entries, matches, players, seasons } from '#lib/server/db/schema.ts';

export function seedPlayers(n: number) {
	const list = Array.from({ length: n }, (_, i) => ({
		id: `p${i + 1}`,
		displayName: `Player ${i + 1}`
	}));
	db.insert(players).values(list).run();
	return list.map((p) => p.id);
}

export const seedSeason = (values: Partial<typeof seasons.$inferInsert> = {}) =>
	db
		.insert(seasons)
		.values({ slug: 's1', name: 'Season 1', ...values })
		.returning()
		.get();

export const seedEntries = (seasonId: number, ids: string[], group: number | null = null) =>
	db
		.insert(entries)
		.values(ids.map((playerId) => ({ seasonId, playerId, group })))
		.run();

export const seedMatch = (values: typeof matches.$inferInsert) =>
	db.insert(matches).values(values).returning().get();
