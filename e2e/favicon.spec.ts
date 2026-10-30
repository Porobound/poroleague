import { expect, test } from '@playwright/test';

test('pages link one favicon, and it serves a PNG', async ({ page, request }) => {
	await page.goto('/');
	const icons = page.locator('link[rel="icon"]');
	await expect(icons).toHaveCount(1);
	const res = await request.get((await icons.getAttribute('href'))!);
	expect(res.ok()).toBe(true);
	expect(res.headers()['content-type']).toBe('image/png');
});
