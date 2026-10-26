import { expect, test } from '@playwright/test';
import { removeSeason, seedFinishedGroups } from './db.ts';
import { SEASONS } from './fixtures.ts';

test.beforeAll(() => seedFinishedGroups('groupGrid', 4));
test.afterAll(() => removeSeason('groupGrid'));

test('the season page shows at most two groups per row', async ({ page }) => {
	await page.goto(`/seasons/${SEASONS.groupGrid}`);
	const heads = page.getByRole('heading', { name: /^Group [A-D]$/ });
	await expect(heads).toHaveCount(4);
	const xs = await heads.evaluateAll((els) =>
		els.map((e) => Math.round(e.getBoundingClientRect().x))
	);
	expect(new Set(xs).size).toBe(2);
});
