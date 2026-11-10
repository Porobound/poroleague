// An organizer approves, rejects with a reason and revokes; the players see the outcome.
import { expect, test } from '@playwright/test';
import { removeSeason, seedHoliday, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player } from './fixtures.ts';

const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const admin = `/seasons/${SEASONS.holidayDecide}/admin/season`;
const pageOf = (n: number) =>
	`/seasons/${SEASONS.holidayDecide}/players/${player('holidayDecide', n)}`;

test.beforeAll(() => {
	seedSeason('holidayDecide', { publishedRound: 2, startDate: day(-3), deadline: day(20) });
	seedHoliday('holidayDecide', 1, day(5), day(6));
	seedHoliday('holidayDecide', 2, day(5), day(6));
});
test.afterAll(() => removeSeason('holidayDecide'));

test('approve, reject with a reason, revoke', async ({ browser }) => {
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(admin);
	const waiting = org.getByRole('listitem').filter({ hasText: 'asked' });
	await expect(org.getByRole('heading', { name: 'Waiting for a decision · 2' })).toBeVisible();

	await waiting.first().getByRole('button', { name: 'Approve' }).click();
	await org.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday approved for');
	await expect(org.getByRole('heading', { name: 'Approved · 1' })).toBeVisible();

	await waiting.first().getByRole('button', { name: 'Reject' }).click();
	const dialog = org.getByRole('dialog');
	await dialog.getByLabel('Reason (optional)').fill('Ask a week ahead.');
	await dialog.getByRole('button', { name: 'Reject' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday rejected for');
	await expect(org.getByRole('heading', { name: /Waiting for a decision/ })).toHaveCount(0);

	const p1 = await browser.newPage(as(player('holidayDecide', 1)));
	await p1.goto(pageOf(1));
	await expect(p1.getByRole('heading', { name: 'Holiday approved' })).toBeVisible();
	const p2 = await browser.newPage(as(player('holidayDecide', 2)));
	await p2.goto(pageOf(2));
	await expect(p2.getByRole('heading', { name: 'Holiday not approved' })).toBeVisible();
	await expect(p2.getByText('“Ask a week ahead.”')).toBeVisible();

	await org.getByRole('button', { name: 'Revoke' }).click();
	await org.getByRole('dialog').getByRole('button', { name: 'Revoke holiday' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday revoked for');
	await expect(org.getByText('No holiday requests.')).toBeVisible();
	await p1.reload();
	await expect(p1.getByRole('heading', { name: 'Holiday revoked' })).toBeVisible();
});
