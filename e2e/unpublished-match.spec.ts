import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.visibility;
let published: number; // round 1
let unpublished: number; // round 2

test.beforeAll(() => {
	[published, , unpublished] = seedSeason('visibility', { publishedRound: 1 });
	// Holiday mode: reported before its week is published.
	seedResult(unpublished, 2, 0, { legends: ['Jinx', 'Viktor'] });
});
test.afterAll(() => removeSeason('visibility'));

for (const [role, id] of [
	['player', player('visibility', 1)],
	['organizer', ORGANIZER]
] as const) {
	test.describe(role, () => {
		test.use(as(id));

		// Without this a dead session would pass the 404 test as a visitor.
		const loggedIn = async (page: Page) => {
			await expect(page.getByRole('button', { name: 'Log out' }).first()).toBeVisible();
			await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(
				role === 'organizer' ? 1 : 0
			);
		};

		test('unpublished match is a 404', async ({ page }) => {
			const res = await page.goto(`/seasons/${slug}/matches/${unpublished}`);
			expect(res?.status()).toBe(404);
			await expect(page.getByRole('heading', { name: 'Match not found' })).toBeVisible();
			await expect(page.getByText('Error 404')).toBeVisible();
			await expect(page.getByRole('link', { name: 'Back to the season' })).toHaveAttribute(
				'href',
				`/seasons/${slug}`
			);
			await loggedIn(page);
		});

		test('published match opens', async ({ page }) => {
			const res = await page.goto(`/seasons/${slug}/matches/${published}`);
			expect(res?.status()).toBe(200);
			await expect(
				page.getByRole('heading', { level: 1, name: /Visibility \d vs Visibility \d/ })
			).toBeVisible();
			await loggedIn(page);
		});
	});
}

// A missing season can't link back to itself.
test('missing season links to all seasons', async ({ page }) => {
	const res = await page.goto('/seasons/no-such-season/schedule');
	expect(res?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Season not found' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'All seasons' })).toHaveAttribute('href', '/seasons');
});

test('an early result counts nowhere public until its week is published', async ({ page }) => {
	await page.goto(`/seasons/${slug}`);
	const row = page.getByRole('row').filter({ hasText: playerName('visibility', 1) });
	await expect(row.getByRole('cell').nth(2)).toHaveText('0');

	await page.goto(`/seasons/${slug}/legends`);
	await expect(page.getByRole('rowheader', { name: 'Jinx' })).toHaveCount(0);

	await page.goto(`/seasons/${slug}/audit`);
	await expect(page.getByText('Nothing logged yet.')).toBeVisible();
});

test.describe('organizer audit log', () => {
	test.use(as(ORGANIZER));
	test('shows the early result, labelled', async ({ page }) => {
		await page.goto(`/seasons/${slug}/audit`);
		await expect(page.getByRole('cell', { name: /^Early, not public/ })).toBeVisible();
	});
});
