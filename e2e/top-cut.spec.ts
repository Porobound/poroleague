import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedFinishedGroups } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.topCut;
test.beforeAll(() => seedFinishedGroups('topCut'));
test.afterAll(() => removeSeason('topCut'));

const game = (page: Page, n: number) =>
	page.getByRole('radiogroup', { name: new RegExp(`^Game ${n}`) });
const confirm = async (page: Page, button: string, confirmLabel: string) => {
	await page.getByRole('button', { name: button }).click();
	await page.getByRole('dialog').getByRole('button', { name: confirmLabel }).click();
};

test('top cut from setup to champion', async ({ browser }) => {
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/admin/top-cut`);
	await expect(org.getByRole('heading', { name: 'Set up the top cut' })).toBeVisible();
	const first = org.getByRole('list', { name: 'First round' });
	await expect(first.getByRole('listitem')).toHaveCount(2);
	for (const [a, b] of [
		[1, 5],
		[4, 2]
	])
		await expect(first).toContainText(
			new RegExp(`${playerName('topCut', a)}.*vs.*${playerName('topCut', b)}`)
		);
	await org.getByLabel('Top cut date (optional)').fill('2026-12-05');
	await confirm(org, 'Publish top cut', 'Publish top cut');
	await expect(org.getByRole('status')).toContainText('Top cut published');

	// Player 1 reports their semifinal against Player 5 from the bracket.
	const p1 = await browser.newPage(as(player('topCut', 1)));
	await p1.goto(`/seasons/${slug}/top-cut`);
	await expect(p1.getByRole('heading', { name: 'Semifinals are up.' })).toBeVisible();
	await p1
		.getByRole('region', { name: 'Bracket' })
		.getByRole('link')
		.filter({ hasText: playerName('topCut', 5) })
		.click();
	await expect(p1.getByText('Semifinal 1')).toBeVisible();
	const [me, them] = [playerName('topCut', 1), playerName('topCut', 5)];
	await p1.getByLabel('Legend').nth(0).selectOption('Ahri');
	await p1.getByLabel('Legend').nth(1).selectOption('Annie');
	await p1.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel(me).check();
	await game(p1, 1).getByLabel(me).check();
	await game(p1, 2).getByLabel(them).check();
	await game(p1, 3).getByLabel(me).check();
	await p1.getByRole('button', { name: 'Add result' }).click();
	await p1.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(p1.getByRole('status')).toContainText('Result saved');

	// The organizer walks over the other semi to Player 4, then the final appears.
	await org.goto(`/seasons/${slug}/admin/top-cut`);
	await confirm(org, `Walkover: ${playerName('topCut', 4)}`, `${playerName('topCut', 4)} advances`);
	await expect(org.getByRole('region', { name: 'Final', exact: true })).toContainText(
		playerName('topCut', 4)
	);
	await confirm(org, `Walkover: ${playerName('topCut', 1)}`, `${playerName('topCut', 1)} advances`);
	await confirm(org, 'Finish season', 'Finish season');
	await expect(org.getByRole('status')).toContainText(`${playerName('topCut', 1)} is the champion`);

	await p1.goto(`/seasons/${slug}`);
	await expect(p1.getByText('E2E topCut champion')).toBeVisible();
	await expect(p1.getByText(playerName('topCut', 1)).first()).toBeVisible();
	await p1.goto('/seasons');
	await expect(p1.getByText('Champion')).toBeVisible();
});

test('the bracket on a phone shows round chips and cards', async ({ browser }) => {
	const page = await browser.newPage({
		...as(player('topCut', 2)),
		viewport: { width: 390, height: 844 }
	});
	await page.goto(`/seasons/${slug}/top-cut`);
	await expect(
		page.getByRole('group', { name: 'Rounds' }).getByRole('button', { name: 'Final', exact: true })
	).toBeVisible();
	await expect(page.getByText('Out in the semifinals.')).toBeVisible();
});
