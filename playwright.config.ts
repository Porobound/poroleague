import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PORT } from './e2e/fixtures.ts';

export const DB = join(tmpdir(), 'poroleague-e2e.db');

export default defineConfig({
	testDir: 'e2e',
	reporter: 'list',
	globalTeardown: './e2e/teardown.ts',
	use: { channel: 'chrome', baseURL: `http://localhost:${PORT}` },
	webServer: {
		command: `rm -f ${DB}* && vite build && node scripts/migrate.ts && node e2e/seed.ts && vite preview --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		timeout: 180_000,
		// Every variable set here, so nothing comes from .env. The dead proxy keeps Discord unreachable:
		// fake organizer sessions keep their role and nothing gets posted.
		env: {
			DATABASE_URL: DB,
			DISCORD_CLIENT_ID: 'e2e',
			DISCORD_CLIENT_SECRET: 'e2e',
			DISCORD_REDIRECT_URI: `http://localhost:${PORT}/auth/callback`,
			GUILD_ID: 'e2e',
			ORGANIZER_ROLE_ID: 'e2e',
			WEBHOOK_RESULTS_URL: '',
			WEBHOOK_ORGANIZERS_URL: '',
			WEBHOOK_PAIRINGS_URL: '',
			NODE_USE_ENV_PROXY: '1',
			HTTPS_PROXY: 'http://127.0.0.1:9'
		}
	}
});
