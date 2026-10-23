// SvelteKit's CSRF origin check only runs in production builds, so only this suite can test it.
import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedSeason } from './db.ts';
import { ORGANIZER, PORT, SEASONS, as, player, posts } from './fixtures.ts';

const slug = SEASONS.csrf;
const site = `http://localhost:${PORT}`;
// Same site as the app (ports don't count), so the Lax session cookie is still sent and only the
// origin check stands between the form and the action.
const attacker = 'http://localhost:4319/';
let match: number; // round 1: Csrf 1 vs Csrf 2

test.beforeAll(() => {
	[match] = seedSeason('csrf', { publishedRound: 2 }); // week 1 out, week 2 next
});
test.afterAll(() => removeSeason('csrf'));

// Serves a page on the attacker origin with a form posting `fields` to `action`, and submits it.
async function crossSitePost(page: Page, action: string, fields: Record<string, string>) {
	const inputs = Object.entries(fields)
		.map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
		.join('');
	await page.route(attacker, (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: `<form method="POST" action="${site}${action}">${inputs}<button>Win a prize</button></form>`
		})
	);
	await page.goto(attacker);
	const response = page.waitForResponse((r) => r.url().startsWith(site + action.split('?')[0]));
	await page.getByRole('button', { name: 'Win a prize' }).click();
	const res = await response;
	expect(res.status()).toBe(403);
	expect((await res.request().allHeaders()).cookie).toContain('session=');
	await expect(page.getByText('Cross-site POST form submissions are forbidden')).toBeVisible();
}

test('player action from another origin is rejected', async ({ browser }) => {
	const page = await browser.newPage(as(player('csrf', 1)));
	await crossSitePost(page, `/seasons/${slug}/matches/${match}?/report`, {
		p1Games: '2',
		p2Games: '0',
		p1Legend: 'Ahri',
		p2Legend: 'Annie',
		dice: player('csrf', 1)
	});
	await page.goto(`/seasons/${slug}/matches/${match}`);
	await expect(page.getByRole('button', { name: 'Add result' })).toBeVisible();
	expect(JSON.stringify(await posts('results'))).not.toContain('Csrf 1');
});

test('organizer action from another origin is rejected', async ({ browser }) => {
	const page = await browser.newPage(as(ORGANIZER));
	await crossSitePost(page, `/seasons/${slug}/admin?/publish`, { week: '2' });
	await page.goto(`/seasons/${slug}/admin`);
	await expect(page.getByRole('button', { name: 'Publish week 2' })).toBeVisible();
	await expect(page.getByText('Players see week 1 of')).toBeVisible();
	expect(JSON.stringify(await posts('pairings'))).not.toContain('E2E csrf');
});
