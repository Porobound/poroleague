import { expect, test, type Page } from '@playwright/test';
import { PUBLISHED_MATCH, SLUG, TOKENS, UNPUBLISHED_MATCH } from './fixtures.ts';

for (const role of ['player', 'organizer'] as const) {
	test.describe(role, () => {
		test.use({
			storageState: {
				cookies: [
					{
						name: 'session',
						value: TOKENS[role],
						domain: 'localhost',
						path: '/',
						expires: -1,
						httpOnly: true,
						secure: false,
						sameSite: 'Lax'
					}
				],
				origins: []
			}
		});

		// Without this a dead session would pass the 404 test as a visitor.
		const loggedIn = async (page: Page) => {
			await expect(page.getByRole('button', { name: 'Log out' }).first()).toBeVisible();
			await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(
				role === 'organizer' ? 1 : 0
			);
		};

		test('unpublished match is a 404', async ({ page }) => {
			const res = await page.goto(`/seasons/${SLUG}/matches/${UNPUBLISHED_MATCH}`);
			expect(res?.status()).toBe(404);
			await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
			await expect(page.getByText('Match not found')).toBeVisible();
			await loggedIn(page);
		});

		test('published match opens', async ({ page }) => {
			const res = await page.goto(`/seasons/${SLUG}/matches/${PUBLISHED_MATCH}`);
			expect(res?.status()).toBe(200);
			await expect(
				page.getByRole('heading', { level: 1, name: /Player \d vs Player \d/ })
			).toBeVisible();
			await loggedIn(page);
		});
	});
}
