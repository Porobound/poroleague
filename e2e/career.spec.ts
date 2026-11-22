// The card at the top of a player's career page.
import { expect, test } from '@playwright/test';
import { removeSeason, renamePlayer, seedResult, seedSeason } from './db.ts';
import { player, playerName } from './fixtures.ts';

const page1 = `/players/${player('career', 1)}`;

test.afterAll(() => removeSeason('career'));

test('name, seasons and the four career numbers in one card', async ({ page }) => {
	// Career 1 won both matches 2–0 and, as player 1 of each, both dice rolls.
	const [m12, , m13] = seedSeason('career', { publishedRound: 2 });
	seedResult(m12, 2, 0);
	seedResult(m13, 2, 0);
	await page.goto(page1);
	await expect(
		page.getByRole('heading', { level: 1, name: playerName('career', 1) })
	).toBeVisible();
	await expect(page.getByText('1 season · first season E2E career')).toBeVisible();

	const stats = page.getByRole('group', { name: 'Career stats' });
	for (const tile of [
		/Matches\s*2/,
		/W–D–L\s*2–0–0/,
		/Game-win %\s*100%/,
		/Dice rolls won\s*2 \/ 2/
	])
		await expect(stats).toContainText(tile);
	await expect(page.getByRole('heading', { name: 'Season by season' })).toBeVisible();
});

test('before a first result: the card without numbers, and a note', async ({ page }) => {
	seedSeason('career', { publishedRound: 1 });
	await page.goto(page1);
	await expect(
		page.getByRole('heading', { level: 1, name: playerName('career', 1) })
	).toBeVisible();
	await expect(page.getByRole('group', { name: 'Career stats' })).toHaveCount(0);
	await expect(page.getByText('No reported matches yet')).toBeVisible();
});

test.describe('phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the four numbers sit two to a row', async ({ page }) => {
		const [m12] = seedSeason('career', { publishedRound: 1 });
		seedResult(m12, 2, 0);
		await page.goto(page1);
		const stats = page.getByRole('group', { name: 'Career stats' });
		const top = async (label: string) => (await stats.getByText(label).boundingBox())!.y;
		expect(await top('Matches')).toBe(await top('W–D–L'));
		expect(await top('Game-win %')).toBe(await top('Dice rolls won'));
		expect(await top('Game-win %')).toBeGreaterThan(await top('Matches'));
	});

	// Runs last: it renames this spec's player.
	test('a long name with no spaces wraps inside the card', async ({ page }) => {
		seedSeason('career', { publishedRound: 1 });
		renamePlayer(player('career', 1), 'Bartholomewfeatherstonehaughs');
		await page.goto(page1);
		const name = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
		expect(name.x + name.width).toBeLessThanOrEqual(390 - 16);
	});
});
