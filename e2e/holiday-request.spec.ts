// Refused holiday requests: the dialog checks the limits as you type, and the server refuses what
// a stale page let through, showing why.
import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedSeason } from './db.ts';
import { SEASONS, as, player } from './fixtures.ts';

const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const me = player('holidayRequest', 1);
const myPage = `/seasons/${SEASONS.holidayRequest}/players/${me}`;

// Two rounds a week: week 1 (rounds 1–2) is published, week 2 (round 3) runs day 4 to day 10.
test.beforeAll(() =>
	seedSeason('holidayRequest', { publishedRound: 2, startDate: day(-3), deadline: day(20) })
);
test.afterAll(() => removeSeason('holidayRequest'));
test.use(as(me));

const fill = async (page: Page, from: string, to: string) => {
	await page.getByRole('button', { name: 'Going away?' }).click();
	const dialog = page.getByRole('dialog', { name: 'Going away?' });
	await dialog.getByLabel('First day away').fill(from);
	await dialog.getByLabel('Last day away').fill(to);
	return dialog;
};

test('the dialog names the problem and holds the request back', async ({ page }) => {
	await page.goto(myPage);
	const dialog = await fill(page, day(5), day(40));
	await expect(dialog.getByRole('alert')).toHaveText('A holiday can be at most 4 weeks.');
	await expect(dialog.getByRole('button', { name: 'Request holiday' })).toBeDisabled();
});

test('a stale page asking for the same days again is refused by the server', async ({
	context
}) => {
	const [first, stale] = [await context.newPage(), await context.newPage()];
	await first.goto(myPage);
	await stale.goto(myPage);
	await (
		await fill(first, day(5), day(6))
	)
		.getByRole('button', { name: 'Request holiday' })
		.click();
	await expect(first.getByRole('heading', { name: 'Holiday requested' })).toHaveCount(1);

	await (
		await fill(stale, day(5), day(6))
	)
		.getByRole('button', { name: 'Request holiday' })
		.click();
	await expect(stale.getByRole('alert')).toHaveText(
		'You already asked for a holiday on some of those days.'
	);
	await expect(stale.getByRole('heading', { name: 'Holiday requested' })).toHaveCount(1);
});
