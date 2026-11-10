// The schedule lists each round as match rows; every row is one link to its match.
import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.schedule;
const name = (n: number) => playerName('schedule', n);
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let ids: number[];

// Week 1 (rounds 1–2) is published and running; Schedule 1 beat Schedule 2 in round 1.
test.beforeAll(() => {
	ids = seedSeason('schedule', { publishedRound: 2, startDate: day(-3), deadline: day(20) });
	seedResult(ids[0], 2, 1);
});
test.afterAll(() => removeSeason('schedule'));
test.use(as(player('schedule', 1)));

test('rows show the score, link to the match, and offer Report on your open match', async ({
	page
}) => {
	await page.goto(`/seasons/${slug}/schedule?week=1`);
	const round1 = page.getByRole('region', { name: 'Group A · Round 1' });
	await expect(round1.getByText('1 of 2 played')).toBeVisible();
	const rows1 = round1.getByRole('list', { name: 'Group A · Round 1' }).getByRole('link');
	await expect(rows1).toHaveCount(2);
	await expect(rows1.filter({ hasText: name(2) })).toHaveAccessibleName(
		new RegExp(`^${name(1)} You.*Ahri 2 to 1 ${name(2)}.*Annie$`)
	);
	await expect(rows1.filter({ hasText: name(2) })).toHaveAttribute(
		'href',
		`/seasons/${slug}/matches/${ids[0]}`
	);
	await expect(round1.getByRole('link', { name: name(2), exact: true })).toHaveCount(0);

	const rows2 = page.getByRole('list', { name: 'Group A · Round 2' }).getByRole('link');
	await expect(rows2.filter({ hasText: name(3) })).toHaveAccessibleName(
		new RegExp(`^${name(1)} You Report result ${name(3)}$`)
	);
	await expect(rows2.filter({ hasText: name(4) })).toHaveAccessibleName(`${name(2)} vs ${name(4)}`);
	await rows2.filter({ hasText: name(3) }).click();
	await expect(page).toHaveURL(`/seasons/${slug}/matches/${ids[2]}`);
});
