// The public API over HTTP: the headers come from hooks.server.ts, so only a real server shows them.
import { expect, test, type APIResponse } from '@playwright/test';
import { removeSeason, seedEmptySeason, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as } from './fixtures.ts';

const API = '/api/v1/seasons';

test.beforeAll(() => {
	seedSeason('api', { publishedRound: 2 });
	seedEmptySeason('apiDraft', 'draft');
});
test.afterAll(() => {
	removeSeason('api');
	removeSeason('apiDraft');
});

const shared = (res: APIResponse) => {
	expect(res.headers()['access-control-allow-origin']).toBe('*');
	expect(res.headers()['cache-control']).toBe('public, max-age=60');
};

test('lists the season but not the draft', async ({ request }) => {
	const res = await request.get(API);
	expect(res.status()).toBe(200);
	shared(res);
	const slugs = (await res.json()).map((s: { slug: string }) => s.slug);
	expect(slugs).toContain(SEASONS.api);
	expect(slugs).not.toContain(SEASONS.apiDraft);
});

test('a season has its players and group', async ({ request }) => {
	const res = await request.get(`${API}/${SEASONS.api}`);
	expect(res.status()).toBe(200);
	shared(res);
	const body = await res.json();
	expect(body.players).toHaveLength(4);
	expect(body.groups[0].standings).toHaveLength(4);
});

test('misses answer in JSON with the same headers', async ({ request }) => {
	for (const path of [`${API}/${SEASONS.apiDraft}`, `${API}/nope`, '/api/v1/nope']) {
		const res = await request.get(path);
		expect(res.status()).toBe(404);
		shared(res);
		expect(await res.json()).toHaveProperty('error');
	}
});

test('is read-only', async ({ request }) => {
	// A JSON body skips the form CSRF check, so this reaches the route.
	const res = await request.post(API, { data: {} });
	expect(res.status()).toBe(405);
});

test('hides drafts from organizers too', async ({ browser }) => {
	const page = await browser.newPage(as(ORGANIZER));
	const res = await page.request.get(`${API}/${SEASONS.apiDraft}`);
	expect(res.status()).toBe(404);
});
