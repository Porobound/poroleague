// Fixed data shared by the seed and the tests.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `npm run shots` sets SHOTS, so it can run beside the e2e tests.
const shots = !!process.env.SHOTS;
export const DB = join(tmpdir(), shots ? 'poroleague-shots.db' : 'poroleague-e2e.db');
export const PORT = shots ? 4319 : 4317;
export const HOOKS_PORT = 4318;
export const ORGANIZER = 'org';

// Each flow gets its own season and players (`e2e/db.ts`), so flows never see each other's writes.
// Players are `<key>-1`, `<key>-2`…, named "<Key> 1", "<Key> 2"….
export const SEASONS = {
	rules: 'e2e-rules',
	visibility: 'e2e-visibility',
	report: 'e2e-report',
	setup: 'e2e-setup',
	full: 'e2e-full',
	finalize: 'e2e-finalize',
	csrf: 'e2e-csrf',
	mobile: 'e2e-mobile',
	mobileSignup: 'e2e-mobile-signup',
	mobileDraft: 'e2e-mobile-draft',
	legends: 'e2e-legends',
	drops: 'e2e-drops',
	erase: 'e2e-erase',
	privacy: 'e2e-privacy',
	perGame: 'e2e-per-game',
	topCut: 'e2e-top-cut',
	groupGrid: 'e2e-group-grid',
	leaderboard: 'e2e-leaderboard',
	api: 'e2e-api',
	apiDraft: 'e2e-api-draft',
	early: 'e2e-early',
	shotsEarly: 'spring-2041',
	shots: 'autumn-2039',
	shotsDraft: 'spring-2040',
	shotsSignup: 'summer-2040',
	shotsCut: 'winter-2039',
	shotsHoliday: 'summer-2039',
	holidayRequest: 'e2e-holiday-request',
	holidayDecide: 'e2e-holiday-decide',
	holidayEarly: 'e2e-holiday-early',
	holidayBadge: 'e2e-holiday-badge',
	holidayPublish: 'e2e-holiday-publish'
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
