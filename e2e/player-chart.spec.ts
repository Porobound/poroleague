// The two panels under the hero card on a player's season page: place by round, and how the
// matches went.
import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, player } from './fixtures.ts';

const s = `/seasons/${SEASONS.chart}`;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const values = { startDate: day(-7), deadline: day(30), topCut: 2 };

// Top 2 of 4 advance. After two rounds: 1 has 6 points, 3 and 2 have 3 (3 ahead on game-win %),
// 4 has none. Player 1 of each match won the dice roll.
function twoRounds() {
	const [m12, m34, m13, m24] = seedSeason('chart', { publishedRound: 2, ...values });
	seedResult(m12, 2, 0);
	seedResult(m34, 2, 0);
	seedResult(m13, 2, 0);
	seedResult(m24, 2, 1);
}
test.beforeAll(twoRounds);
test.afterAll(() => removeSeason('chart'));

const position = (page: Page) => page.getByRole('region', { name: 'Group position' });
const went = (page: Page) => page.getByRole('region', { name: 'How matches went' });

test('place by round, as a chart and as a table', async ({ page }) => {
	await page.goto(`${s}/players/${player('chart', 1)}`);
	const table = position(page).getByRole('table');
	await expect(table).toBeHidden();

	// Pointing at the last round shows its place and points on the chart. The table is still
	// closed, so the only visible "Round 2" is the tooltip's.
	const round2 = position(page).getByText('Round 2', { exact: true });
	await expect(round2.filter({ visible: true })).toHaveCount(0);
	const box = (await position(page).locator('svg').boundingBox())!;
	// The last point sits at the plot's right edge, 44px in from the svg's.
	await page.mouse.move(box.x + box.width - 44, box.y + box.height / 2);
	await expect(round2.filter({ visible: true })).toHaveCount(1);
	await expect(position(page).getByText('#1 of 4')).toBeVisible();
	await page.mouse.move(0, 0);
	await expect(round2.filter({ visible: true })).toHaveCount(0);

	await position(page).getByText('Show as a table').click();
	const rows = table.getByRole('row');
	await expect(rows).toHaveCount(3);
	// After round 1 two players have won 2–0 without meeting. Level players are normal while
	// the season is on, so the row carries no "tied".
	await expect(rows.nth(1)).toHaveText(/Round 1\s*(1st|2nd) of 4\s*3 pts/);
	await expect(rows.nth(2)).toHaveText(/Round 2\s*1st of 4\s*6 pts/);
});

test('how the matches went', async ({ page }) => {
	await page.goto(`${s}/players/${player('chart', 1)}`);
	const items = went(page).getByRole('listitem');
	await expect(items).toHaveText([
		/Won 2–0\s*2/,
		/Won 2–1 or 1–0\s*0/,
		/Drew\s*0/,
		/Lost 1–2 or 0–1\s*0/,
		/Lost 0–2\s*0/
	]);
	await expect(went(page)).toContainText(/Best win streak\s*2/);
	await expect(went(page)).toContainText(/Went to game 3\s*—/);
	await expect(went(page)).toContainText(/Won with the dice roll\s*100%/);
	await expect(went(page)).toContainText(/Won without it\s*—/);

	// Player 2 lost 0–2 without the roll, then won a three-game match with it.
	await page.goto(`${s}/players/${player('chart', 2)}`);
	await expect(went(page)).toContainText(/Went to game 3\s*1 of 1 won/);
	await expect(went(page)).toContainText(/Won with the dice roll\s*100%/);
	await expect(went(page)).toContainText(/Won without it\s*0%/);
});

test.describe('phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the chart fits: nothing reaches past the right edge', async ({ page }) => {
		await page.goto(`${s}/players/${player('chart', 1)}`);
		await expect(position(page)).toBeVisible();
		// Two rounds is the case where a round's hover area was once as wide as the whole plot.
		const widest = await position(page).evaluate((el) =>
			Math.max(...[...el.querySelectorAll('*')].map((x) => x.getBoundingClientRect().right))
		);
		expect(widest).toBeLessThanOrEqual(390);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
	});
});

test('one round played: the breakdown shows, the chart waits for a second point', async ({
	page
}) => {
	const [m12] = seedSeason('chart', { publishedRound: 1, ...values });
	seedResult(m12, 2, 0);
	await page.goto(`${s}/players/${player('chart', 1)}`);
	await expect(went(page)).toBeVisible();
	await expect(went(page).getByText('1 match', { exact: true })).toBeVisible();
	await expect(position(page)).toHaveCount(0);
});

test('after the deadline the header counts matches, not matches played', async ({ page }) => {
	// One of three played and the deadline gone: the other two count as losses.
	const [m12] = seedSeason('chart', {
		publishedRound: 3,
		startDate: day(-30),
		deadline: day(-1),
		topCut: 2
	});
	seedResult(m12, 2, 0);
	await page.goto(`${s}/players/${player('chart', 1)}`);
	await expect(went(page).getByText('3 matches', { exact: true })).toBeVisible();
	await expect(went(page).getByRole('listitem').filter({ hasText: 'Not played' })).toHaveText(
		/Not played\s*2/
	);
	await expect(page.getByText('1 of 3 played')).toBeVisible();
});

test('nothing played: neither panel', async ({ page }) => {
	seedSeason('chart', { publishedRound: 1, ...values });
	await page.goto(`${s}/players/${player('chart', 1)}`);
	await expect(page.getByRole('heading', { name: 'Matches this season' })).toBeVisible();
	await expect(went(page)).toHaveCount(0);
	await expect(position(page)).toHaveCount(0);
});
