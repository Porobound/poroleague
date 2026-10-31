import { expect, test, type Page } from '@playwright/test';
import { ORGANIZER, as } from './fixtures.ts';

const html = (page: Page) => page.locator('html');

test('desktop toggle switches the theme and the server remembers it', async ({ page }) => {
	await page.goto('/rules');
	await expect(html(page)).toHaveAttribute('data-theme', 'dark');
	const nav = page.getByRole('navigation', { name: 'Main' });

	await nav.getByRole('button', { name: 'Switch to light mode' }).click();
	await expect(html(page)).toHaveAttribute('data-theme', 'light');
	await expect(nav.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();

	// Rendered by the server: the reload's HTML already says light, before any script runs.
	const res = await page.reload();
	expect(await res!.text()).toContain('data-theme="light"');
	await expect(html(page)).toHaveAttribute('data-theme', 'light');

	await nav.getByRole('button', { name: 'Switch to dark mode' }).click();
	await page.goto('/seasons');
	await expect(html(page)).toHaveAttribute('data-theme', 'dark');
});

test.describe('phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('logged out: icon button next to Log in', async ({ page }) => {
		await page.goto('/rules');
		await page.getByRole('button', { name: 'Switch to light mode' }).click();
		await expect(html(page)).toHaveAttribute('data-theme', 'light');
		await page.reload();
		await expect(html(page)).toHaveAttribute('data-theme', 'light');
	});

	test.describe('logged in', () => {
		test.use(as(ORGANIZER));

		test('account menu toggles the theme', async ({ page }) => {
			await page.goto('/rules');
			await page
				.getByRole('navigation', { name: 'Main' })
				.getByRole('group')
				.getByText('Org')
				.click();
			await page.getByRole('button', { name: 'Light mode' }).click();
			await expect(html(page)).toHaveAttribute('data-theme', 'light');
			await expect(page.getByRole('button', { name: 'Dark mode' })).toBeVisible();
			await page.reload();
			await expect(html(page)).toHaveAttribute('data-theme', 'light');
		});
	});
});
