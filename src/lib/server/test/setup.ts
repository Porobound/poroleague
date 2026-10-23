import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, vi } from 'vitest';
import { DATABASE_URL } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, players, seasons, sessions } from '#lib/server/db/schema.ts';

// Under vitest `$app/env/private` reads the real .env: local.db and live Discord webhooks. Never let a test see it.
vi.mock('$app/env/private', () => ({
	DATABASE_URL: ':memory:',
	DISCORD_CLIENT_ID: 'test-client',
	DISCORD_CLIENT_SECRET: 'test-secret',
	DISCORD_REDIRECT_URI: 'http://localhost/auth/callback',
	GUILD_ID: 'test-guild',
	ORGANIZER_ROLE_ID: 'test-organizer-role',
	WEBHOOK_RESULTS_URL: '',
	WEBHOOK_ORGANIZERS_URL: '',
	WEBHOOK_PAIRINGS_URL: ''
}));

// beforeEach wipes every table: refuse to run against anything but the in-memory DB.
if (DATABASE_URL !== ':memory:') throw new Error(`Tests must use :memory:, got ${DATABASE_URL}`);
migrate(db, { migrationsFolder: 'drizzle' });

beforeEach(() => {
	// No test reaches the network by accident; stub fetch in the test that needs it.
	vi.stubGlobal('fetch', () => Promise.reject(new Error('fetch called in a test; stub it')));
	for (const t of [audit, sessions, matches, entries, seasons, players]) db.delete(t).run();
});
