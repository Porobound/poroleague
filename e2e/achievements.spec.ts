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
	const section = page.getByRole('region', { name: 'Achievements', exact: true });
	const row = (list: string, name: string) =>
		section
			.getByRole('list', { name: list })
			.getByRole('listitem')
			.filter({ has: page.getByText(name, { exact: true }) });
	const ahri = row('Legend mastery', 'Ahri');

	await page.goto(`/players/${me}`);
	await expect(section).toContainText('0 of 28 earned');
	const tabs = section.getByRole('navigation', { name: 'Achievements and mastery' });
	await tabs.getByRole('link', { name: 'Mastery' }).click();
	await expect(page).toHaveURL(/tab=mastery/);
	await expect(section).toContainText('0 of 58 legends ranked');
	await expect(ahri).toContainText('Unranked');
	await expect(ahri).toContainText('2/3 to Bronze');

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

	// Mastery: every legend, ten a page, most played first or by name; a rank links to its season.
	await page.goto(`/players/${me}?tab=mastery`);
	await expect(section).toContainText('1 of 58 legends ranked');
	await expect(ahri).toContainText('Bronze');
	await expect(ahri).toContainText('3 matches');
	await expect(ahri).toContainText('3/7 to Silver');
	await expect(ahri.getByRole('link')).toHaveAttribute('href', `/seasons/${slug}`);
	const legends = section.getByRole('list', { name: 'Legend mastery' }).getByRole('listitem');
	await expect(legends).toHaveCount(10);
	await section
		.getByRole('navigation', { name: 'Sort legends' })
		.getByRole('link', { name: 'Name' })
		.click();
	await expect(page).toHaveURL(/tab=mastery&sort=name/);
	await expect(legends.nth(1)).toContainText('Akali');
	await section
		.getByRole('navigation', { name: 'Show' })
		.getByRole('link', { name: 'Ranked', exact: true })
		.click();
	await expect(legends).toHaveCount(1);

	await page.goto(`/players/${me}`);
	// Earned ones lead the list, each with its rank, its date and a link to its season.
	const first = row('Achievements', 'First Blood');
	await expect(first).toContainText('Bronze');
	await expect(first).toContainText(/\d{1,2} \w{3,4} \d{4}/);
	await expect(first.getByRole('link')).toHaveAttribute('href', `/seasons/${slug}`);

	// The filter and the pages are plain links.
	const show = section.getByRole('navigation', { name: 'Show' });
	await show.getByRole('link', { name: 'Earned' }).click();
	await expect(page).toHaveURL(/show=earned/);
	await expect(section.getByRole('list', { name: 'Achievements' })).not.toContainText('Locked');
	await show.getByRole('link', { name: 'Locked' }).click();
	const pages = section.getByRole('navigation', { name: 'Pages' });
	await expect(
		section.getByRole('list', { name: 'Achievements' }).getByRole('listitem')
	).toHaveCount(10);
	// What is under way comes first among the locked: two wins towards Contender.
	await expect(row('Achievements', 'Contender')).toContainText('2/5');
	await pages.getByRole('link', { name: 'Next' }).click();
	await expect(page).toHaveURL(/show=locked&page=2/);
	await expect(pages.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

	// The season player page shows the best of both in a strip that leads back here.
	await page.goto(`/seasons/${slug}/players/${me}`);
	const strip = page.getByRole('region', { name: 'Achievements and mastery' });
	await strip.getByRole('button', { name: /^Achievement: First Blood\./ }).click();
	await expect(page.getByText('Win the first game of a match.')).toBeVisible();
	await expect(strip.getByRole('button', { name: /^Mastery: Ahri · Bronze\./ })).toBeVisible();
	await strip.getByRole('link', { name: 'Mastery' }).click();
	await expect(page).toHaveURL(new RegExp(`/players/${me}\\?tab=mastery#achievements$`));
});
