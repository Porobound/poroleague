import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, playerName } from './fixtures.ts';

const slug = SEASONS.finalize;
const [p1, p2] = [playerName('finalize', 1), playerName('finalize', 2)];

// Finalize 1 and 2 draw and win their other matches 2–0, so they're tied on points,
// head-to-head and game-win %: only the organizer can order them. 3 vs 4 is flagged.
test.beforeAll(() => {
	const [m12, m34, m13, m24, m14, m23] = seedSeason('finalize', {
		publishedRound: 3,
		deadline: '2026-01-01'
	});
	seedResult(m12, 1, 1);
	seedResult(m34, 2, 0, 'Wrong score.');
	seedResult(m13, 2, 0);
	seedResult(m24, 2, 0);
	seedResult(m14, 2, 0);
	seedResult(m23, 2, 0);
});
test.afterAll(() => removeSeason('finalize'));

test.use(as(ORGANIZER));

const finalize = (page: Page) => page.getByRole('button', { name: 'Finalize season' });
const end = (page: Page) => page.getByRole('region', { name: 'End of season' });

test('tiebreak and finalize', async ({ page }) => {
	await page.goto(`/seasons/${slug}/admin/season`);
	await expect(page.getByRole('heading', { name: 'End of season' })).toBeVisible();
	await expect(end(page).getByText('1 open', { exact: true })).toBeVisible();
	await expect(end(page).getByText('1 to order', { exact: true })).toBeVisible();
	await expect(finalize(page)).toBeDisabled();

	// Closing the flag leaves the tie, so finalize stays blocked.
	await page.goto(`/seasons/${slug}/admin`);
	await page.getByRole('button', { name: 'Keep as reported' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Keep result' }).click();
	await expect(page.getByRole('status')).toContainText('Flag closed.');
	await page.goto(`/seasons/${slug}/admin/season`);
	await expect(end(page).getByText('No open flags.')).toBeVisible();
	await expect(end(page).getByText('1 to order', { exact: true })).toBeVisible();
	await expect(finalize(page)).toBeDisabled();

	// Order the tie: Finalize 2 above Finalize 1.
	const ties = end(page);
	await expect(ties.getByRole('listitem')).toHaveText([new RegExp(p1), new RegExp(p2)]);
	await ties.getByRole('button', { name: `Move ${p2} up` }).click();
	await expect(page.getByRole('status')).toContainText('Tiebreak order saved.');
	await expect(ties.getByRole('listitem')).toHaveText([new RegExp(p2), new RegExp(p1)]);
	await expect(ties.getByRole('button', { name: 'Order confirmed ✓' })).toBeDisabled();
	await expect(finalize(page)).toBeEnabled();

	await finalize(page).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Finalize season' }).click();
	await expect(page.getByRole('status')).toContainText(
		'E2E finalize is finalized and in the archive.'
	);

	// The archive lists it as finished, with the tiebreak's winner.
	await page.goto('/seasons');
	const card = page
		.getByRole('listitem')
		.filter({ has: page.getByRole('link', { name: 'E2E finalize' }) });
	await expect(card).toContainText('Finished');
	await expect(card).toContainText(p2);
});
