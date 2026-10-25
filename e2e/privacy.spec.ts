import { expect, test } from '@playwright/test';
import { removeSeason, seedEmptySeason, seedPlayers } from './db.ts';
import { SEASONS, as, player } from './fixtures.ts';

test.afterAll(() => removeSeason('privacy'));

test('the footer links to the privacy notice', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'Footer' })
		.getByRole('link', { name: 'Privacy' })
		.click();
	await expect(page).toHaveURL('/privacy');
	await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Your rights' })).toBeVisible();
});

test('signup points to the privacy notice', async ({ browser }) => {
	seedPlayers('privacy', 1);
	seedEmptySeason('privacy', 'signup');
	const page = await browser.newPage(as(player('privacy', 1)));
	await page.goto(`/seasons/${SEASONS.privacy}`);
	await expect(page.getByRole('link', { name: 'privacy notice' })).toHaveAttribute(
		'href',
		'/privacy'
	);
});
