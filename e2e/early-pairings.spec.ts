// Pairings published before their week starts show up right away, without moving the calendar week.
import { expect, test } from '@playwright/test';
import { removeMatch, removeSeason, seedSeason } from './db.ts';
import { SEASONS, as, player } from './fixtures.ts';

const s = `/seasons/${SEASONS.early}`;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
// Two rounds a week: rounds 1–2 are this week, round 3 is next week's, already published.
const midSeason = () =>
	seedSeason('early', { publishedRound: 3, startDate: day(0), deadline: day(30) });

test.afterAll(() => removeSeason('early'));

test.describe('as a player', () => {
	test.use(as(player('early', 2)));

	test('sees next week beside this week, on both pages', async ({ page }) => {
		midSeason();
		await page.goto(s);
		const thisWeek = page.getByRole('region', { name: 'Your matches this week' });
		await expect(thisWeek.getByText('Round 1')).toBeVisible();
		await expect(thisWeek.getByText('Round 3')).toHaveCount(0);
		const next = page.getByRole('region', { name: 'Up next: week 2' });
		await expect(next.getByText('Round 3')).toBeVisible();
		await expect(next.getByText('Round 1')).toHaveCount(0);

		await page.goto(`${s}/players/${player('early', 2)}`);
		const rows = page.getByRole('list', { name: 'Matches this season' }).getByRole('listitem');
		await expect(rows).toHaveCount(3);
		await expect(rows.first()).toContainText('Round 3');
		await expect(rows.last()).toContainText('Round 1');
		await expect(rows.last()).toContainText('Report result');
	});

	test('still sees last week’s unplayed match, marked overdue', async ({ page }) => {
		seedSeason('early', { publishedRound: 3, startDate: day(-7), deadline: day(30) });
		await page.goto(`${s}/players/${player('early', 2)}`);
		const row = page
			.getByRole('list', { name: 'Matches this season' })
			.getByRole('listitem')
			.filter({ hasText: 'Round 1' });
		await expect(row.getByText('Overdue')).toBeVisible();
	});

	test('sees week 1 before the season starts', async ({ page }) => {
		seedSeason('early', { publishedRound: 2, startDate: day(3), deadline: day(30) });
		await page.goto(s);
		await expect(
			page.getByRole('region', { name: 'Up next: week 1' }).getByText('Round 1')
		).toBeVisible();
		await expect(page.getByText('No matches for you this week.')).toHaveCount(0);
	});

	test('sees nothing ahead until it is published', async ({ page }) => {
		seedSeason('early', { publishedRound: 2, startDate: day(0), deadline: day(30) });
		await page.goto(s);
		await expect(page.getByRole('region', { name: 'Your matches this week' })).toBeVisible();
		await expect(page.getByRole('region', { name: /Up next/ })).toHaveCount(0);
		await expect(page.getByText(/pairings are out/)).toHaveCount(0);
	});
});

test.describe('with a bye next week', () => {
	test.use(as(player('early', 1)));

	test('says so', async ({ page }) => {
		removeMatch(midSeason()[4]); // Early 1 vs Early 4, round 3
		await page.goto(s);
		await expect(
			page.getByRole('region', { name: 'Up next: week 2' }).getByText('You have a bye in round 3')
		).toBeVisible();
	});
});

test('a visitor gets a link to the new pairings', async ({ page }) => {
	midSeason();
	await page.goto(s);
	await page.getByRole('link', { name: 'Week 2 pairings are out' }).click();
	await expect(page).toHaveURL(/schedule\?week=2$/);
	await expect(page.getByText('Round 3').first()).toBeVisible();
});
