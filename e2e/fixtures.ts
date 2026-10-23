// Fixed data shared by the seed and the tests.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DB = join(tmpdir(), 'poroleague-e2e.db');
export const PORT = 4317;
export const HOOKS_PORT = 4318;
export const ORGANIZER = 'org';

// Each flow gets its own season and players (`e2e/db.ts`), so flows never see each other's writes.
// Players are `<key>-1`, `<key>-2`…, named "<Key> 1", "<Key> 2"….
export const SEASONS = {
	rules: 'e2e-rules',
	visibility: 'e2e-visibility',
	report: 'e2e-report',
	setup: 'e2e-setup',
	finalize: 'e2e-finalize',
	csrf: 'e2e-csrf',
	mobile: 'e2e-mobile',
	mobileSignup: 'e2e-mobile-signup',
	mobileDraft: 'e2e-mobile-draft',
	legends: 'e2e-legends',
	drops: 'e2e-drops'
};
export type SeasonKey = keyof typeof SEASONS;

export const player = (key: SeasonKey, n: number) => `${key}-${n}`;
export const playerName = (key: SeasonKey, n: number) =>
	`${key[0].toUpperCase()}${key.slice(1)} ${n}`;
export const token = (playerId: string) => `e2e-${playerId}`;

// Context options for a logged-in browser: `test.use(as(id))` or `browser.newPage(as(id))`.
export const as = (playerId: string) => ({
	storageState: {
		cookies: [
			{
				name: 'session',
				value: token(playerId),
				domain: 'localhost',
				path: '/',
				expires: -1,
				httpOnly: true,
				secure: false,
				sameSite: 'Lax' as const
			}
		],
		origins: []
	}
});

export type Post = {
	channel: 'results' | 'organizers' | 'pairings';
	body: {
		content?: string;
		embeds?: { title: string; description?: string; fields?: { name: string; value: string }[] }[];
	};
};
// Everything the app has posted to the webhook listener so far.
export const posts = async (channel: Post['channel']) =>
	((await (await fetch(`http://localhost:${HOOKS_PORT}/`)).json()) as Post[])
		.filter((p) => p.channel === channel)
		.map((p) => p.body);
