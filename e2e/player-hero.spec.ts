// The card at the top of a player's season page: place, gap to the top cut, stat strip and form.
import { expect, test, type Page } from '@playwright/test';
import { dropPlayer, removeSeason, renamePlayer, seedResult, seedSeason } from './db.ts';
import { SEASONS, player, type SeasonKey } from './fixtures.ts';

const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const at = (key: SeasonKey, n: number) => `/seasons/${SEASONS[key]}/players/${player(key, n)}`;
const stats = (page: Page) => page.getByRole('group', { name: 'Season stats' });
const form = (page: Page) => page.getByRole('list', { name: 'Results, oldest first' });

test.describe('two rounds played, top 2 of 4 advance', () => {
	// 1 has 6 points, 3 and 2 have 3 (3 ahead on game-win %), 4 has none.
	test.beforeAll(() => {
		const [m12, m34, m13, m24] = seedSeason('hero', {
			publishedRound: 2,
			startDate: day(-7),
			deadline: day(30),
			topCut: 2
		});
		seedResult(m12, 2, 0);
		seedResult(m34, 2, 0);
		seedResult(m13, 2, 0);
		seedResult(m24, 2, 1);
	});
	test.afterAll(() => removeSeason('hero'));

	test('the leader: place, points clear of the cut, stats and a winning run', async ({ page }) => {
		await page.goto(at('hero', 1));
		await expect(page.getByText('#1 of 4')).toBeVisible();
		await expect(page.getByText('In the top 2 · 3 pts clear')).toBeVisible();

		for (const tile of [
			'Points6',
			'W–D–L2–0–0',
			'Win rate100%',
			'Game-win %100%',
			'Games4–0',
			'Dice rolls won2 / 2'
		])
			await expect(stats(page)).toContainText(tile);

		await expect(form(page).getByRole('listitem')).toHaveText([
			/Round 1: won 2–0$/,
			/Round 2: won 2–0$/
		]);
		await expect(page.getByText('2 wins in a row')).toBeVisible();
	});

	test('outside the cut: points short of it, and a losing run', async ({ page }) => {
		await page.goto(at('hero', 4));
		await expect(page.getByText('#4 of 4')).toBeVisible();
		await expect(page.getByText('3 pts off the top 2')).toBeVisible();
		await expect(stats(page)).toContainText('W–D–L0–0–2');
		await expect(stats(page)).toContainText('Win rate0%');
		await expect(stats(page)).toContainText('Games1–4');
		await expect(form(page).getByRole('listitem')).toHaveText([
			/Round 1: lost 0–2$/,
			/Round 2: lost 1–2$/
		]);
		await expect(page.getByText('2 losses in a row')).toBeVisible();
	});

	test('level with the last place inside the cut', async ({ page }) => {
		await page.goto(at('hero', 2));
		await expect(page.getByText('#3 of 4')).toBeVisible();
		await expect(page.getByText('Level on points with the top 2')).toBeVisible();
		// One result each way is not a run.
		await expect(page.getByText('in a row')).toHaveCount(0);
	});
});

test.describe('phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	test.beforeAll(() => {
		seedSeason('heroLong', { publishedRound: 1 });
		renamePlayer(player('heroLong', 1), 'Bartholomewfeatherstonehaughs');
	});
	test.afterAll(() => removeSeason('heroLong'));

	test('a long name with no spaces wraps inside the card', async ({ page }) => {
		await page.goto(at('heroLong', 1));
		const name = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
		expect(name.x + name.width).toBeLessThanOrEqual(390 - 16);
	});
});

test.describe('a new season', () => {
	test.beforeAll(() => {
		seedSeason('heroNew', {
			publishedRound: 1,
			startDate: day(-1),
			deadline: day(30),
			topCut: 2
		});
	});
	test.afterAll(() => removeSeason('heroNew'));

	test('no place is shown before the player has a result', async ({ page }) => {
		await page.goto(at('heroNew', 1));
		await expect(stats(page)).toContainText('Points0');
		await expect(page.getByText('Group position')).toHaveCount(0);
		await expect(page.getByText(/#\d/)).toHaveCount(0);
	});
});

test.describe('a drawn match', () => {
	// 3 beat 4; 1 and 2 drew. 4 is one point off second place.
	test.beforeAll(() => {
		const [m12, m34] = seedSeason('heroDraw', {
			publishedRound: 1,
			startDate: day(-1),
			deadline: day(30),
			topCut: 2
		});
		seedResult(m12, 1, 1);
		seedResult(m34, 2, 0);
	});
	test.afterAll(() => removeSeason('heroDraw'));

	test('a gap of one point reads "1 pt"', async ({ page }) => {
		await page.goto(at('heroDraw', 4));
		await expect(page.getByText('1 pt off the top 2')).toBeVisible();
		await page.goto(at('heroDraw', 3));
		await expect(page.getByText('In the top 2 · 2 pts clear')).toBeVisible();
	});
});

test.describe('a dropped player in the group', () => {
	test.beforeAll(() => {
		const [m12] = seedSeason('heroDrop', { publishedRound: 1 });
		seedResult(m12, 2, 0);
		dropPlayer('heroDrop', 4);
	});
	test.afterAll(() => removeSeason('heroDrop'));

	test('the card and the season history give the same group size', async ({ page }) => {
		// Four were drawn into the group and one dropped: both say "of 4".
		await page.goto(at('heroDrop', 1));
		await expect(page.getByText('#1 of 4')).toBeVisible();
		await page.goto(`/players/${player('heroDrop', 1)}`);
		await expect(page.getByText('#1 of 4')).toBeVisible();
	});
});

test.describe('after the deadline', () => {
	test.afterEach(() => removeSeason('heroLate'));

	// Only round 1 was played. Rounds 2 and 3 count as losses in the standings, published or not,
	// so the whole strip and the form say the same.
	for (const publishedRound of [3, 1])
		test(`unplayed matches are losses in the strip and the form, ${publishedRound} of 3 rounds published`, async ({
			page
		}) => {
			const [m12] = seedSeason('heroLate', {
				publishedRound,
				startDate: day(-30),
				deadline: day(-1),
				topCut: 2
			});
			seedResult(m12, 2, 0);
			await page.goto(at('heroLate', 1));
			await expect(stats(page)).toContainText('W–D–L1–0–2');
			await expect(stats(page)).toContainText('Win rate33%');
			await expect(stats(page)).toContainText('Games2–0');
			await expect(form(page).getByRole('listitem')).toHaveText([
				/Round 1: won 2–0$/,
				/Round 2: not played, a loss$/,
				/Round 3: not played, a loss$/
			]);
			await expect(page.getByText('2 losses in a row')).toBeVisible();
		});
});
