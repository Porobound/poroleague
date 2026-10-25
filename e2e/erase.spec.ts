import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.erase;
const page2 = `/seasons/${slug}/players/${player('erase', 2)}`;
let match: number;

// Erase 1 reported a 2–0 over Erase 2, who flagged it.
test.beforeAll(() => {
	[match] = seedSeason('erase', { publishedRound: 3 });
	seedResult(match, 2, 0, { flag: 'Wrong score.' });
});
test.afterAll(() => removeSeason('erase'));

test('players never see the erase control', async ({ browser }) => {
	const p = await browser.newPage(as(player('erase', 1)));
	await p.goto(page2);
	await expect(p.getByRole('heading', { level: 1, name: playerName('erase', 2) })).toBeVisible();
	await expect(p.getByRole('button', { name: 'Erase player…' })).toHaveCount(0);
});

test('an organizer erases a player mid-season: dropped, shown as a former player', async ({
	browser
}) => {
	const victim = await browser.newPage(as(player('erase', 2)));
	await victim.goto('/');
	await expect(victim.getByRole('link', { name: 'Log in with Discord' })).toHaveCount(0);

	const page = await browser.newPage(as(ORGANIZER));
	await page.goto(page2);
	await page.getByRole('button', { name: 'Erase player…' }).click();
	const dialog = page.getByRole('dialog', { name: `Erase ${playerName('erase', 2)}?` });
	const confirm = dialog.getByRole('button', { name: 'Erase player' });
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel(`Type ${playerName('erase', 2)} to confirm`).fill('erase 2');
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel(`Type ${playerName('erase', 2)} to confirm`).fill(playerName('erase', 2));
	await confirm.click();

	const status = page.getByRole('status');
	await expect(status).toHaveText(
		/^Player erased\. Their results now show as Former player [0-9a-f]{4}\.$/
	);
	const former = (await status.textContent())!.match(/Former player [0-9a-f]{4}/)![0];
	await expect(page.getByRole('heading', { level: 1, name: former })).toBeVisible();
	await expect(page.getByText('· Account erased.')).toBeVisible();
	await expect(page.getByText('Dropped', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Erase player…' })).toHaveCount(0);

	// The season is in play, so erasing dropped them: out of the standings, their matches void.
	await page.goto(`/seasons/${slug}`);
	await expect(page.getByRole('table').first().getByText(former)).toHaveCount(0);
	await expect(page.getByText(`Dropped: ${former}. Their matches are void.`)).toBeVisible();
	await expect(page.getByText(playerName('erase', 2))).toHaveCount(0);

	// The match keeps its score, now void; the flag reason is gone.
	await page.goto(`/seasons/${slug}/matches/${match}`);
	await expect(page.getByText(former).first()).toBeVisible();
	await expect(page.getByRole('link', { name: former })).toHaveCount(0);
	await expect(page.getByText('Wrong score.')).toHaveCount(0);

	await page.goto(`/seasons/${slug}/audit`);
	await expect(page.getByRole('cell', { name: `Erased a player · now ${former}` })).toBeVisible();
	await expect(page.getByRole('cell', { name: /reason removed$/ })).toBeVisible();
	await expect(page.getByText(playerName('erase', 2))).toHaveCount(0);

	// Their session is gone.
	await victim.reload();
	await expect(victim.getByRole('link', { name: 'Log in with Discord' })).toBeVisible();
});
