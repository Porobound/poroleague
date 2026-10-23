import { expect, it } from 'vitest';
import { DATABASE_URL } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { seasons } from '#lib/server/db/schema.ts';
import { seedEntries, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

it('runs against a migrated in-memory DB, never local.db', () => {
	expect(DATABASE_URL).toBe(':memory:');
	const s = seedSeason({ status: 'signup' });
	seedEntries(s.id, seedPlayers(2));
	expect(db.select().from(seasons).all()).toMatchObject([{ slug: 's1', status: 'signup' }]);
});

it('starts each test empty', () => {
	expect(db.select().from(seasons).all()).toEqual([]);
});

it('blocks real network calls', async () => {
	await expect(fetch('https://discord.com')).rejects.toThrow('stub it');
});
