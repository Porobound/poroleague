import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, playerName } from './fixtures.ts';

const url = `/seasons/${SEASONS.legends}/legends`;

// Picks: Jinx 3, Ahri 2, Annie 1, so picks order, A–Z and Z–A all differ.
// Jinx is played by Legends 1 (twice) and Legends 3.
test.beforeAll(() => {
	const [m12, m34, m13] = seedSeason('legends', { publishedRound: 3 });
	seedResult(m12, 2, 0, { legends: ['Jinx', 'Ahri'] });
	seedResult(m34, 2, 1, { legends: ['Jinx', 'Ahri'] });
	seedResult(m13, 1, 2, { legends: ['Jinx', 'Annie'] });
});
test.afterAll(() => removeSeason('legends'));

// Short enough that the table needs scrolling.
test.use({ viewport: { width: 1280, height: 400 } });

test('sort and expand keep the scroll position', async ({ page }) => {
	await page.goto(url);
	const rows = page.getByRole('rowheader');
	const column = (name: string) => page.getByRole('columnheader', { name });
	await expect(rows).toHaveText(['Jinx', 'Ahri', 'Annie']);
	await expect(column('Picks')).toHaveAttribute('aria-sort', 'descending');

	await column('Legend').evaluate((el) => el.scrollIntoView());
	const y = await page.evaluate(() => scrollY);
	expect(y).toBeGreaterThan(0);
	const kept = () => expect.poll(() => page.evaluate(() => scrollY)).toBe(y);

	// Another column starts in its own direction; clicking it again flips it.
	await column('Legend').getByRole('link').click();
	await expect(page).toHaveURL(`${url}?sort=legend`);
	await expect(rows).toHaveText(['Ahri', 'Annie', 'Jinx']);
	await expect(column('Legend')).toHaveAttribute('aria-sort', 'ascending');
	await kept();
	await column('Legend').getByRole('link').click();
	await expect(page).toHaveURL(`${url}?sort=legend&dir=desc`);
	await expect(rows).toHaveText(['Jinx', 'Annie', 'Ahri']);
	await kept();

	// Expanding a legend lists who played it, and keeps the sort.
	const jinx = page.getByRole('link', { name: 'Jinx' });
	await jinx.click();
	await expect(page).toHaveURL(`${url}?sort=legend&dir=desc&legend=Jinx`);
	await expect(jinx).toHaveAttribute('aria-expanded', 'true');
	await expect(
		page.getByRole('list', { name: 'Players who used Jinx' }).getByRole('link')
	).toHaveText([
		new RegExp(`${playerName('legends', 1)}$`),
		new RegExp(`${playerName('legends', 3)}$`)
	]);
	await kept();
	await jinx.click();
	await expect(page).toHaveURL(`${url}?sort=legend&dir=desc`);
	await expect(page.getByRole('list', { name: 'Players who used Jinx' })).toHaveCount(0);
});

// Regression: hiding the picks count on phone cards also hid zeros in W–D–L.
test('phone cards show every W–D–L number', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${url}?legend=Jinx`);
	await expect(
		page.getByRole('list', { name: 'Players who used Jinx' }).getByRole('listitem')
	).toHaveText(
		[
			new RegExp(`${playerName('legends', 1)}\\s*1–0–1`),
			new RegExp(`${playerName('legends', 3)}\\s*1–0–0`)
		],
		{ useInnerText: true }
	);
});
