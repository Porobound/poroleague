// The public API over HTTP: the headers come from hooks.server.ts, so only a real server shows them.
import { expect, test, type APIResponse } from '@playwright/test';
import { removeSeason, seedEmptySeason, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as } from './fixtures.ts';

const API = '/api/v1/seasons';

const REASON = 'Game two was conceded after a misclick.';

test.beforeAll(() => {
	const [first] = seedSeason('api', { publishedRound: 2 });
	seedResult(first, 2, 1, { flag: REASON, legends: ['Jinx', 'Ahri'] });
	seedEmptySeason('apiDraft', 'draft');
});
test.afterAll(() => {
	removeSeason('api');
	removeSeason('apiDraft');
});

const shared = (res: APIResponse) => {
	expect(res.headers()['access-control-allow-origin']).toBe('*');
	expect(res.headers()['cache-control']).toBe(res.ok() ? 'public, max-age=60' : 'no-store');
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
	for (const path of [`${API}/${SEASONS.apiDraft}`, `${API}/nope`, '/api/v1/nope', '/api/v1']) {
		const res = await request.get(path);
		expect(res.status()).toBe(404);
		shared(res);
		expect(await res.json()).toHaveProperty('error');
	}
});

test('serves its OpenAPI spec', async ({ request }) => {
	const res = await request.get('/api/v1/openapi.json');
	expect(res.status()).toBe(200);
	shared(res);
	const spec = await res.json();
	expect(spec.openapi).toBe('3.1.0');
	expect(Object.keys(spec.paths)).toContain('/seasons/{slug}/matches');
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

test('matches cover published rounds only, with flags but no reasons', async ({ request }) => {
	const res = await request.get(`${API}/${SEASONS.api}/matches`);
	expect(res.status()).toBe(200);
	shared(res);
	const ms = await res.json();
	expect(ms.map((m: { round: number }) => m.round)).toEqual([1, 1, 2, 2]);
	expect(ms[0]).toMatchObject({
		flag: 'open',
		result: { p1Games: 2, p2Games: 1, p1Legend: 'Jinx', p2Legend: 'Ahri' }
	});
	expect(JSON.stringify(ms)).not.toContain(REASON);
});

test('legends and top cut', async ({ request }) => {
	const legends = await (await request.get(`${API}/${SEASONS.api}/legends`)).json();
	expect(legends.map((l: { legend: string }) => l.legend).sort()).toEqual(['Ahri', 'Jinx']);
	const cut = await request.get(`${API}/${SEASONS.api}/top-cut`);
	expect(cut.status()).toBe(404);
	expect(await cut.json()).toEqual({ error: 'No top cut yet' });
});

test('the footer links to the API docs', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'API' }).click();
	await expect(page).toHaveURL('/api');
	await expect(page.getByRole('heading', { level: 1, name: 'API' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Matches' })).toBeVisible();
});

test('the privacy notice mentions the API', async ({ page }) => {
	await page.goto('/privacy');
	await expect(page.getByRole('link', { name: 'API' }).first()).toHaveAttribute('href', '/api');
});
