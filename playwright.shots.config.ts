// `npm run shots`: screenshots of pages, kept in the repo. See CLAUDE.md. Sets SHOTS so that
// e2e/fixtures.ts gives this run its own port and database.
import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';
import { DB, PORT } from './e2e/fixtures.ts';

export default defineConfig({
	...base,
	testDir: 'shots',
	globalSetup: undefined,
	use: { ...base.use, baseURL: `http://localhost:${PORT}` },
	webServer: {
		...base.webServer,
		command: `rm -f ${DB}* && vite build && node scripts/migrate.ts && node e2e/seed.ts && NODE_OPTIONS=--import=./shots/clock.ts vite preview --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`
	}
});
