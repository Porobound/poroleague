import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.drops;
const name = (n: number) => playerName('drops', n);
let flagged: number;

// 1 beat 2, 3 beat 4 (flagged by 4); the other four matches are unplayed.
test.beforeAll(() => {
	const ids = seedSeason('drops', { publishedRound: 3 });
	seedResult(ids[0], 2, 0);
	seedResult(ids[1], 2, 0, { flag: 'Wrong score.' });
	flagged = ids[1];
});
test.afterAll(() => removeSeason('drops'));

test.use(as(ORGANIZER));

// How many matches each status filter on the Matches page shows.
async function filtered(page: Page) {
	const counts: Record<string, number> = {};
	await page.goto(`/seasons/${slug}/admin/matches`);
	const filters = page.getByRole('group', { name: 'Filter by status' });
	for (const label of await filters.getByRole('link').allTextContents()) {
		const link = filters.getByRole('link', { name: label, exact: true });
		await link.click();
		await expect(link).toHaveAttribute('aria-current', 'true');
		counts[label] = await page.getByRole('rowgroup').nth(1).getByRole('row').count();
	}
	return counts;
}

// The player's W–D–L on the Players page, '—' once they're out of the standings.
const record = async (page: Page, n: number) => {
	await page.goto(`/seasons/${slug}/admin/players`);
	return page
		.getByRole('row')
		.filter({ hasText: name(n) })
		.getByRole('cell')
		.nth(3);
};

test('match filters, drop and cancel drop', async ({ page, browser }) => {
	const before = { All: 6, 'Unplayed & overdue': 4, Reported: 1, Flagged: 1, Resolved: 0, Void: 0 };
	expect(await filtered(page)).toEqual(before);
	await expect(await record(page, 3)).toHaveText('1–0–0');

	// Dropping 4 voids their three matches, 3's flagged win over them included.
	const row4 = page.getByRole('row').filter({ hasText: name(4) });
	await row4.getByRole('button', { name: 'Drop' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Drop player' }).click();
	await expect(page.getByRole('status')).toContainText(
		`${name(4)} dropped. Their matches are void.`
	);
	await expect(row4.getByText('Dropped', { exact: true })).toBeVisible();
	expect(await filtered(page)).toEqual({
		All: 6,
		'Unplayed & overdue': 2,
		Reported: 1,
		Flagged: 0,
		Resolved: 0,
		Void: 3
	});
	await expect(await record(page, 3)).toHaveText('0–0–0');
	await expect(await record(page, 4)).toHaveText('—');

	// Players see why the match doesn't count.
	const p3 = await browser.newPage(as(player('drops', 3)));
	await p3.goto(`/seasons/${slug}/matches/${flagged}`);
	await expect(p3.getByText("A player dropped out, so this match doesn't count.")).toBeVisible();

	// Cancelling the drop brings the matches back, open flag included.
	await page.goto(`/seasons/${slug}/admin/players`);
	await row4.getByRole('button', { name: 'Cancel drop' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel drop' }).click();
	await expect(page.getByRole('status')).toContainText(
		`${name(4)}'s drop is cancelled. Their matches count again.`
	);
	await expect(await record(page, 3)).toHaveText('1–0–0');
	expect(await filtered(page)).toEqual(before);
});
