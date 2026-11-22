import { expect, test } from '@playwright/test';

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
