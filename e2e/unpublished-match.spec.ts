import { expect, test, type Page } from '@playwright/test';
import { ORGANIZER, SEASONS, as, player } from './fixtures.ts';

const { slug, first } = SEASONS.visibility;
const PUBLISHED = first; // round 1
const UNPUBLISHED = first + 2; // round 2

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
			const res = await page.goto(`/seasons/${slug}/matches/${UNPUBLISHED}`);
			expect(res?.status()).toBe(404);
			await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
			await expect(page.getByText('Match not found')).toBeVisible();
			await loggedIn(page);
		});

		test('published match opens', async ({ page }) => {
			const res = await page.goto(`/seasons/${slug}/matches/${PUBLISHED}`);
			expect(res?.status()).toBe(200);
			await expect(
				page.getByRole('heading', { level: 1, name: /Visibility \d vs Visibility \d/ })
			).toBeVisible();
			await loggedIn(page);
		});
	});
}
