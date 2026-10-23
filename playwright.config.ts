import { defineConfig } from '@playwright/test';
import { DB, HOOKS_PORT, PORT } from './e2e/fixtures.ts';

const hook = (channel: string) => `http://localhost:${HOOKS_PORT}/${channel}`;

export default defineConfig({
	testDir: 'e2e',
	reporter: 'list',
	// Flows share one database and one webhook listener.
	workers: 1,
	globalSetup: './e2e/global.ts',
	use: { channel: 'chrome', baseURL: `http://localhost:${PORT}` },
	webServer: {
		command: `rm -f ${DB}* && vite build && node scripts/migrate.ts && node e2e/seed.ts && vite preview --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		timeout: 180_000,
		// Every variable set here, so nothing comes from .env. Webhooks go to the listener in global.ts;
		// the dead proxy keeps Discord unreachable, so fake organizer sessions keep their role.
		env: {
			DATABASE_URL: DB,
			DISCORD_CLIENT_ID: 'e2e',
			DISCORD_CLIENT_SECRET: 'e2e',
			DISCORD_REDIRECT_URI: `http://localhost:${PORT}/auth/callback`,
			GUILD_ID: 'e2e',
			ORGANIZER_ROLE_ID: 'e2e',
			WEBHOOK_RESULTS_URL: hook('results'),
			WEBHOOK_ORGANIZERS_URL: hook('organizers'),
			WEBHOOK_PAIRINGS_URL: hook('pairings'),
			NODE_USE_ENV_PROXY: '1',
			HTTPS_PROXY: 'http://127.0.0.1:9',
			NO_PROXY: 'localhost'
		}
	}
});
