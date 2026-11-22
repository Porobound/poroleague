// The standings mark who is inside the top cut: a tinted place chip and a labelled line.
import { expect, test, type Locator } from '@playwright/test';
import { markErased, removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, as, player, playerName } from './fixtures.ts';

const name = (n: number) => playerName('cutLine', n);

// Top 2 of 4 advance. After two rounds: 1 has 6 points, 3 and 2 have 3 (3 ahead on game-win %),
// 4 has none.
test.beforeAll(() => {
	const [m12, m34, m13, m24] = seedSeason('cutLine', { publishedRound: 2, topCut: 2 });
	seedResult(m12, 2, 0);
	seedResult(m34, 2, 0);
	seedResult(m13, 2, 0);
	seedResult(m24, 2, 1);
});
test.afterAll(() => removeSeason('cutLine'));

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
// The chip is the place cell's only child.
const chip = (cell: Locator) =>
	cell.evaluate((el) => getComputedStyle(el.firstElementChild!).backgroundColor);

test('places inside the cut get a chip and the line is labelled', async ({ page }) => {
	await page.goto(`/seasons/${SEASONS.cutLine}`);
	const rows = page.getByRole('table').getByRole('row');
	const row = (n: number) => rows.filter({ hasText: name(n) });
	// Each link starts with the avatar's initials.
	await expect(rows.getByRole('link')).toHaveText(
		[1, 3, 2, 4].map((n) => new RegExp(name(n) + '$'))
	);

	const place = (n: number) => row(n).getByRole('cell').first();
	await expect(place(3)).toHaveText('2');
	expect(await chip(place(1))).not.toBe(TRANSPARENT);
	expect(await chip(place(3))).not.toBe(TRANSPARENT);
	expect(await chip(place(2))).toBe(TRANSPARENT);
	expect(await chip(place(4))).toBe(TRANSPARENT);
	// The leader's chip is its own colour.
	expect(await chip(place(1))).not.toBe(await chip(place(3)));

	// The label hangs on the last row inside the cut, and only there.
	const label = (n: number) =>
		row(n)
			.getByRole('cell')
			.last()
			.evaluate((el) => getComputedStyle(el, '::after').content);
	expect(await label(3)).toContain('Top 2 advance');
	// With empty alt text, so a screen reader hears the points alone.
	expect(await label(3)).toMatch(/\/ ""$/);
	expect(await label(1)).toBe('none');
	expect(await label(2)).toBe('none');
	// The points cell still reads as the points alone.
	await expect(row(3).getByRole('cell').last()).toHaveText('3');
});

test.describe('logged in', () => {
	test.use(as(player('cutLine', 2)));

	test('your own row is marked on its left edge', async ({ page }) => {
		await page.goto(`/seasons/${SEASONS.cutLine}`);
		const rows = page.getByRole('table').getByRole('row');
		const edge = (n: number) =>
			rows
				.filter({ hasText: name(n) })
				.getByRole('cell')
				.first()
				.evaluate((el) => getComputedStyle(el).boxShadow);
		expect(await edge(2)).not.toBe('none');
		expect(await edge(4)).toBe('none');
	});
});

// Runs last: it erases a player of this spec's season.
test('an erased player inside the top places does not take a place in the cut', async ({
	page
}) => {
	// The leader is erased but not dropped, as in a season that ended first. The two who advance
	// are the next two, so the line moves down a row.
	markErased(player('cutLine', 1));
	await page.goto(`/seasons/${SEASONS.cutLine}`);
	const rows = page.getByRole('table').getByRole('row');
	const points = (n: number) => rows.nth(n).getByRole('cell').last();
	const label = (n: number) => points(n).evaluate((el) => getComputedStyle(el, '::after').content);
	expect(await label(1)).toBe('none');
	expect(await label(2)).toBe('none');
	expect(await label(3)).toContain('Top 2 advance');
	// The erased leader keeps first place's own chip; the cut tint starts with the next row.
	expect(await chip(rows.nth(2).getByRole('cell').first())).not.toBe(TRANSPARENT);
	expect(await chip(rows.nth(3).getByRole('cell').first())).not.toBe(TRANSPARENT);
});
