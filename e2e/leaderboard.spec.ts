import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, as, player, playerName } from './fixtures.ts';

// Leaderboard 1 beats 2, 3 beats 4, then 1 beats 3: 1 ends on 1532, 4 on 1484.
test.beforeAll(() => {
	const [m12, m34, m13] = seedSeason('leaderboard', { publishedRound: 3 });
	seedResult(m12, 2, 0);
	seedResult(m34, 2, 1);
	seedResult(m13, 2, 1);
});
test.afterAll(() => removeSeason('leaderboard'));

const row = (page: import('@playwright/test').Page, n: number) =>
	page.getByRole('row').filter({ hasText: playerName('leaderboard', n) });

test('an organizer sees every player ranked by rating', async ({ browser }) => {
	const page = await browser.newPage(as(ORGANIZER));
	await page.goto('/admin');
	await page.getByRole('link', { name: 'All players, ranked across seasons' }).click();
	await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible();
	await expect(row(page, 1)).toContainText('1532');
	await expect(row(page, 1)).toContainText('2–0–0');
	await expect(row(page, 1)).toContainText('#1 of 4');
	await expect(row(page, 4)).toContainText('1484');
	await expect(row(page, 4)).toContainText('0–0–1');
	await row(page, 1)
		.getByRole('link', { name: playerName('leaderboard', 1) })
		.click();
	await expect(page).toHaveURL(`/players/${player('leaderboard', 1)}`);
});

test('a player is refused', async ({ browser }) => {
	const page = await browser.newPage(as(player('leaderboard', 1)));
	await page.goto('/admin/players');
	await expect(page).toHaveURL('/login/not-organizer');
});
