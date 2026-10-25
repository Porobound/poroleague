import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.perGame;
const name = (n: number) => playerName('perGame', n);
let ms: number[]; // 1v2, 3v4 · 1v3, 2v4 · 1v4, 2v3

test.beforeAll(() => {
	ms = seedSeason('perGame', { publishedRound: 3 });
	seedResult(ms[1], 2, 1); // reported before per-game reporting: counts only
});
test.afterAll(() => removeSeason('perGame'));
test.use(as(player('perGame', 1)));

const game = (page: Page, n: number) =>
	page.getByRole('radiogroup', { name: new RegExp(`^Game ${n}`) });
const chips = (page: Page) => page.getByRole('list', { name: 'Games' }).getByRole('listitem');
// A player's points in the standings.
const points = async (page: Page, n: number) => {
	await page.goto(`/seasons/${slug}`);
	return page.getByRole('row').filter({ hasText: name(n) }).getByRole('cell').last();
};

// Picks each game's winner (player number, or 'D'), fills legends and dice, saves.
async function report(page: Page, match: number, games: (number | 'D')[], opponent: number) {
	await page.goto(`/seasons/${slug}/matches/${match}`);
	for (const [i, g] of games.entries())
		await game(page, i + 1)
			.getByLabel(g === 'D' ? 'Draw' : name(g))
			.check();
	await page.getByLabel('Legend').nth(0).selectOption('Ahri');
	await page.getByLabel('Legend').nth(1).selectOption('Annie');
	await page
		.getByRole('group', { name: 'Who won the dice roll?' })
		.getByLabel(name(opponent))
		.check();
	await page.getByRole('button', { name: 'Add result' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(page.getByRole('status').first()).toContainText('Result saved');
}

test('a 2–0 leaves game 3 unplayed', async ({ page }) => {
	await report(page, ms[0], [1, 1], 2);
	await expect(chips(page)).toHaveCount(2);
	await expect(chips(page).nth(1)).toHaveAttribute('title', `Game 2: ${name(1)} won`);
	await expect(await points(page, 1)).toHaveText('3');
});

test('a 1–1 with a drawn game 3 is a draw', async ({ page }) => {
	await page.goto(`/seasons/${slug}/matches/${ms[2]}`);
	await game(page, 1).getByLabel(name(1)).check();
	await game(page, 2).getByLabel(name(3)).check();
	await game(page, 3).getByLabel('Draw').check();
	await expect(page.getByText('Result: Draw 1–1')).toBeVisible();
	await report(page, ms[2], [1, 3, 'D'], 3);
	await expect(chips(page).nth(2)).toHaveAttribute('title', 'Game 3: draw');
	// 3 for the 2–1 before, 1 for the draw.
	await expect(await points(page, 3)).toHaveText('4');
});

test('a gap is refused, in the form and on the server', async ({ page }) => {
	await page.goto(`/seasons/${slug}/matches/${ms[4]}`);
	await game(page, 1).getByLabel(name(1)).check();
	await game(page, 3).getByLabel(name(4)).check();
	await expect(page.getByRole('alert')).toHaveText("Game 3 can't be played without game 2.");
	await page.getByLabel('Legend').nth(0).selectOption('Ahri');
	await page.getByLabel('Legend').nth(1).selectOption('Annie');
	await page.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel(name(4)).check();
	await expect(page.getByRole('button', { name: 'Add result' })).toBeDisabled();

	// Past the disabled button: the server says the same and saves nothing.
	await page.locator('form[action="?/report"]').evaluate((f: HTMLFormElement) => f.requestSubmit());
	await expect(page.getByRole('alert').first()).toHaveText(
		"Game 3 can't be played without game 2."
	);
	await page.goto(`/seasons/${slug}/matches/${ms[4]}`);
	await expect(page.getByRole('button', { name: 'Add result' })).toBeVisible();
});

test('Clear puts a game back to not played', async ({ page }) => {
	await page.goto(`/seasons/${slug}/matches/${ms[4]}`);
	await game(page, 1).getByLabel(name(4)).check();
	await game(page, 2).getByLabel(name(1)).check();
	await game(page, 3).getByLabel(name(1)).check();
	await expect(page.getByText(`Result: ${name(1)} 2–1 ${name(4)}`)).toBeVisible();
	await page.getByRole('button', { name: 'Clear game 3' }).click();
	await expect(game(page, 3).getByRole('radio', { checked: true })).toHaveCount(0);
	await expect(page.getByText('Result: Draw 1–1')).toBeVisible();
});

test('a result from before per-game reporting shows its counts only', async ({ page }) => {
	await page.goto(`/seasons/${slug}/matches/${ms[1]}`);
	await expect(page.getByRole('article')).toContainText(name(3));
	await expect(page.getByRole('article').getByText('2', { exact: true })).toBeVisible();
	await expect(page.getByRole('list', { name: 'Games' })).toHaveCount(0);
});
