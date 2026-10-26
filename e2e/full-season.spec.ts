import { expect, test } from '@playwright/test';
import { removeSeason, seedEmptySeason, seedEntries, seedPlayers } from './db.ts';
import { SEASONS, as, player } from './fixtures.ts';

const CAP = 128; // MAX_PLAYERS

test.beforeAll(() => {
	seedPlayers('full', CAP + 1);
	seedEmptySeason('full', 'signup');
	seedEntries('full', 1, CAP);
});
test.afterAll(() => removeSeason('full'));

test('a full season offers no sign-up, logged in or out', async ({ page, browser }) => {
	const late = await browser.newPage(as(player('full', CAP + 1)));
	for (const p of [page, late]) {
		await p.goto(`/seasons/${SEASONS.full}`);
		await expect(p.getByText('Season is full.')).toBeVisible();
		await expect(p.getByRole('button', { name: /^Sign up for/ })).toHaveCount(0);
		await expect(p.getByRole('link', { name: 'Log in with Discord to sign up' })).toHaveCount(0);
	}
});
