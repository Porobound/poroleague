import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, playerName } from './fixtures.ts';

test.beforeAll(() => {
	const [first] = seedSeason('header', { publishedRound: 1 });
	seedResult(first, 2, 0);
});
test.afterAll(() => removeSeason('header'));

test('the skip link is the first tab stop and jumps past the header', async ({ page }) => {
	await page.goto('/rules');
	await page.keyboard.press('Tab');
	const skip = page.getByRole('link', { name: 'Skip to content' });
	await expect(skip).toBeFocused();
	await expect(skip).toBeInViewport();

	await skip.press('Enter');
	await expect(page).toHaveURL('/rules#main');
	// The next tab stop is in the page, not back in the header.
	await page.keyboard.press('Tab');
	await expect(page.getByRole('main').locator(':focus')).toHaveCount(1);
});

test('the header stays in view while the page scrolls', async ({ page }) => {
	await page.goto('/rules');
	const nav = page.getByRole('navigation', { name: 'Main' });
	await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
	await expect(page.getByRole('heading', { level: 1 })).not.toBeInViewport();
	await expect(nav.getByRole('link', { name: 'Rules' })).toBeInViewport();
	await expect(nav.getByRole('link', { name: 'Rules' })).toHaveAttribute('aria-current', 'page');
});

test('a section link lands with its heading below the header', async ({ page }) => {
	await page.goto('/rules#5-reporting-results');
	const heading = page.getByRole('heading', { name: '5. Reporting results' });
	await expect(heading).toBeInViewport();
	const header = await page.getByRole('banner').boundingBox();
	const box = await heading.boundingBox();
	expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
});

test('a player name in the standings is a link to their page', async ({ page }) => {
	await page.goto(`/seasons/${SEASONS.header}`);
	const name = playerName('header', 1);
	const link = page.getByRole('table').getByRole('link', { name });
	// Quiet until hovered: the same colour as the row's numbers, not the accent.
	const colour = (l: typeof link) => l.evaluate((el) => getComputedStyle(el).color);
	const points = page.getByRole('row').filter({ hasText: name }).getByRole('cell').last();
	expect(await colour(link)).toBe(await colour(points));
	await link.click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
});
