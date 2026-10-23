// Fixed data shared by the seed and the tests.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DB = join(tmpdir(), 'poroleague-e2e.db');
export const PORT = 4317;
export const HOOKS_PORT = 4318;
export const ORGANIZER = 'org';

// Each flow gets its own season and four players (`e2e/db.ts`), so flows never see each other's
// writes. Players are `<key>-1`…`<key>-4`, named "<Key> 1"…; seeded matches get ids
// `first`…`first + 5`: round 1: 1v2, 3v4 · round 2: 1v3, 2v4 · round 3: 1v4, 2v3.
export const SEASONS = {
	visibility: { slug: 'e2e-visibility', first: 1 },
	report: { slug: 'e2e-report', first: 11 }
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
	body: { embeds?: { title: string; description?: string }[]; content?: string };
};
// Everything the app has posted to the webhook listener so far.
export const posts = async (channel: Post['channel']) =>
	((await (await fetch(`http://localhost:${HOOKS_PORT}/`)).json()) as Post[])
		.filter((p) => p.channel === channel)
		.map((p) => p.body);
