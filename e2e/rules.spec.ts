import { expect, test } from '@playwright/test';
import { removeSeason, seedEmptySeason, seedPlayers, seedResult, seedSeason } from './db.ts';
import { SEASONS, as, player } from './fixtures.ts';

const slug = SEASONS.rules;

test.afterAll(() => removeSeason('rules'));

test('rules page renders docs/rules.md, without the ideas', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Rules' }).click();
	await expect(page).toHaveURL('/rules');
	await expect(page.getByRole('heading', { level: 1, name: 'Poroleague Rules' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2 })).toHaveCount(9);
	await expect(page.getByText('A saved report is final:')).toBeVisible();
	await expect(page.getByText('Ideas for future seasons')).toHaveCount(0);

	await page.goto('/rules#5-reporting-results');
	await expect(page.getByRole('heading', { name: '5. Reporting results' })).toBeInViewport();
});

test('signup, report and flag link to the rules', async ({ browser }) => {
	// Signup: one running season at a time, so the season in play comes after.
	seedPlayers('rules', 1);
	seedEmptySeason('rules', 'signup');
	const p = await browser.newPage(as(player('rules', 1)));
	await p.goto(`/seasons/${slug}`);
	await expect(p.getByRole('link', { name: 'rules', exact: true })).toHaveAttribute(
		'href',
		'/rules'
	);

	// Rules 1 reported a win over 2 (round 1) and has round 2 against 3 open.
	const [reported, , open] = seedSeason('rules', { publishedRound: 3 });
	seedResult(reported, 2, 0);
	await p.goto(`/seasons/${slug}`);
	await expect(p.getByRole('link', { name: 'How standings work' })).toHaveAttribute(
		'href',
		'/rules#4-points-and-standings'
	);
	const reportingRules = p.getByRole('dialog').getByRole('link', { name: 'Reporting rules' });

	await p.goto(`/seasons/${slug}/matches/${reported}`);
	await p.getByRole('button', { name: 'Flag this result' }).click();
	await expect(reportingRules).toHaveAttribute('href', '/rules#5-reporting-results');

	// The report dialog opens once the form is filled in.
	await p.goto(`/seasons/${slug}/matches/${open}`);
	for (const n of [1, 2])
		await p
			.getByRole('radiogroup', { name: new RegExp(`^Game ${n}`) })
			.getByRole('radio')
			.first()
			.check();
	await p.getByLabel('Legend').nth(0).selectOption('Ahri');
	await p.getByLabel('Legend').nth(1).selectOption('Annie');
	await p.getByRole('group', { name: 'Who won the dice roll?' }).getByRole('radio').first().check();
	await p.getByRole('button', { name: 'Add result' }).click();
	await expect(reportingRules).toHaveAttribute('href', '/rules#5-reporting-results');
});

test('the footer and the rules page show the Riot disclaimer', async ({ page }) => {
	const notice = /created under Riot Games' "Legal Jibber Jabber" policy.*does not endorse/;
	await page.goto('/');
	await expect(page.getByRole('contentinfo').getByText(notice)).toBeVisible();
	await page.goto('/rules');
	await expect(page.getByRole('main').getByText(notice)).toBeVisible();
	await expect(page.getByRole('contentinfo').getByText(notice)).toBeVisible();
});
