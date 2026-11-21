import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, playerName } from './fixtures.ts';

test.beforeAll(() => {
	const [first] = seedSeason('standings', { publishedRound: 1 });
	seedResult(first, 2, 0);
});
test.afterAll(() => removeSeason('standings'));

test('W/D/L come before M and zeros are muted', async ({ page }) => {
	await page.goto(`/seasons/${SEASONS.standings}`);
	const table = page.getByRole('table');
	await expect(table.getByRole('columnheader')).toHaveText([
		'#',
		'Player',
		'W',
		'D',
		'L',
		'M',
		'GW%',
		'Pts'
	]);

	const cells = table
		.getByRole('row')
		.filter({ hasText: playerName('standings', 1) })
		.getByRole('cell');
	const [w, d, pts] = [cells.nth(2), cells.nth(3), cells.last()];
	await expect(w).toHaveText('1');
	await expect(d).toHaveText('0');
	const color = (cell: typeof w) => cell.evaluate((el) => getComputedStyle(el).color);
	expect(await color(d)).not.toBe(await color(w));
	expect(await color(w)).toBe(await color(pts));
});
