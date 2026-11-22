// Keyboard and pointer basics that hold on every page. These pages need no season.
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

test('a link reached by keyboard has a focus ring', async ({ page }) => {
	await page.goto('/rules');
	const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Rules' });
	const outline = () => link.evaluate((el) => getComputedStyle(el).outlineStyle);
	expect(await outline()).toBe('none');
	while (!(await link.evaluate((el) => el === document.activeElement)))
		await page.keyboard.press('Tab');
	expect(await outline()).toBe('solid');
});

test('a primary link-button keeps its text colour when hovered', async ({ page }) => {
	await page.goto('/login/failed');
	const button = page.getByRole('link', { name: 'Try again with Discord' });
	const colour = () => button.evaluate((el) => getComputedStyle(el).color);
	const before = await colour();
	await button.hover();
	expect(await colour()).toBe(before);
});
