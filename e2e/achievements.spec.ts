import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.achievements;
const me = player('achievements', 1);
const name = playerName('achievements', 1);
let third: number; // round 3: Achievements 1 vs Achievements 4

// Two Ahri matches already in (seeded, so nothing awarded): a 2–0 win and a 0–2 loss.
test.beforeAll(() => {
	const ids = seedSeason('achievements', { publishedRound: 3 });
	seedResult(ids[0], 2, 0);
	seedResult(ids[2], 0, 2);
	third = ids[4];
});
test.afterAll(() => removeSeason('achievements'));
test.use(as(me));

test('a report that crosses a threshold shows the achievement on the career page', async ({
	page
}) => {
	const section = page.getByRole('region', { name: 'Achievements' });
	const tile = (n: string) =>
		section.getByRole('listitem').filter({ has: page.getByText(n, { exact: true }) });

	await page.goto(`/players/${me}`);
	await expect(
		tile('Ahri Player').getByRole('progressbar', { name: 'Ahri Player progress' })
	).toHaveAttribute('aria-valuenow', '2');
	await expect(tile('Ahri Player')).toContainText('2/3');

	await page.goto(`/seasons/${slug}/matches/${third}`);
	await page.getByLabel('Legend').nth(0).selectOption('Ahri');
	await page.getByLabel('Legend').nth(1).selectOption('Annie');
	await page.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel(name).check();
	for (const g of [1, 2])
		await page
			.getByRole('radiogroup', { name: new RegExp(`^Game ${g}`) })
			.getByLabel(name)
			.check();
	await page.getByRole('button', { name: 'Add result' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(page.getByRole('status').first()).toContainText('Result saved');

	await page.goto(`/players/${me}`);
	await expect(tile('Ahri Player')).toContainText(/Earned \d{1,2} \w{3} \d{4}/);
	await expect(tile('Ahri Player').getByRole('progressbar')).toHaveCount(0);
	await expect(tile('First Blood')).toContainText('Earned');
	await expect(tile('Ahri Expert')).toContainText('3/10');
});
