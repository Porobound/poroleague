import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedEmptySeason, seedEntries, seedOrganizer, seedPlayers } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.full;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(() => {
	seedOrganizer();
	seedPlayers('full', 5);
	seedEmptySeason('full', 'signup');
	seedEntries('full', 1, 3);
});
test.afterAll(() => removeSeason('full'));
test.describe.configure({ mode: 'serial' });

const save = async (page: Page) => {
	await page.getByRole('button', { name: 'Save changes' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
};

test('an organizer caps the season, never below the signups', async ({ browser }) => {
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/admin/season`);
	await org.getByLabel('Start date').fill(day(7));
	await org.getByLabel('Season deadline').fill(day(70));
	await org.getByLabel('Max players').fill('2');
	await save(org);
	await expect(
		org.getByText('3 already signed up. Remove players or set 3 or more.')
	).toBeVisible();

	await org.getByLabel('Max players').fill('4');
	await org.getByLabel('Players per group').fill('4');
	await save(org);
	await expect(org.getByRole('status')).toHaveText('Saved.');
	await expect(org.getByLabel('Max players')).toHaveValue('4');
	await expect(org.getByText('Up to 32 with groups of 4 (at most 8 groups).')).toBeVisible();
	await org.close();
});

test('players see the cap and the groups, until the season is full', async ({ page, browser }) => {
	const fourth = await browser.newPage(as(player('full', 4)));
	await fourth.goto(`/seasons/${slug}`);
	await expect(fourth.getByText('3 / 4')).toBeVisible();
	await expect(fourth.getByText('1 spot left')).toBeVisible();
	await expect(fourth.getByText('Groups of up to 4')).toBeVisible();
	await expect(fourth.getByText('3 signed up → 1 group of 3.')).toBeVisible();
	await fourth.getByRole('button', { name: /^Sign up for/ }).click();
	await expect(fourth.getByText('4 / 4')).toBeVisible();
	await expect(fourth.getByText('No spots left')).toBeVisible();
	await fourth.close();

	// Full for everyone not in, logged in or out.
	const late = await browser.newPage(as(player('full', 5)));
	for (const p of [page, late]) {
		await p.goto(`/seasons/${slug}`);
		await expect(p.getByText('Season is full.')).toBeVisible();
		await expect(p.getByText('All 4 spots are taken')).toBeVisible();
		await expect(p.getByRole('button', { name: /^Sign up for/ })).toHaveCount(0);
		await expect(p.getByRole('link', { name: 'Log in with Discord to sign up' })).toHaveCount(0);
	}
	await late.close();
});

test('admin players lists signups in signup order', async ({ browser }) => {
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/admin/players`);
	await expect(org.getByText('In signup order.')).toBeVisible();
	const items = org.getByRole('listitem').filter({ hasText: /^#\d/ });
	await expect(items).toHaveCount(4);
	// Player 4 signed up on the site, after the three seeded signups.
	await expect(items.nth(3)).toContainText('#4');
	await expect(items.nth(3)).toContainText(playerName('full', 4));
	await org.close();
});
