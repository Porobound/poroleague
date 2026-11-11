// A holiday unlocks a match early: its two players see and report it, nobody else sees a thing.
import { expect, test } from '@playwright/test';
import { removeSeason, seedHoliday, seedSeason } from './db.ts';
import { ORGANIZER, PORT, SEASONS, as, player, posts } from './fixtures.ts';

const slug = SEASONS.holidayEarly;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let early: number; // round 3: HolidayEarly 1 vs HolidayEarly 4

// Two rounds a week: week 1 (rounds 1–2) is published, week 2 (round 3) isn't.
test.beforeAll(() => {
	early = seedSeason('holidayEarly', {
		publishedRound: 2,
		startDate: day(-3),
		deadline: day(20)
	})[4];
	seedHoliday('holidayEarly', 1, day(5), day(6), 'approved');
});
test.afterAll(() => removeSeason('holidayEarly'));

test('both players see the early match, the opponent reports it, it stays hidden', async ({
	browser
}) => {
	const p1 = await browser.newPage(as(player('holidayEarly', 1)));
	await p1.goto(`/seasons/${slug}/players/${player('holidayEarly', 1)}`);
	const mine = p1.getByRole('list', { name: 'Matches this season' }).getByRole('listitem');
	await expect(mine.first()).toContainText('HolidayEarly 4');
	await expect(mine.first().getByText('Early', { exact: true })).toBeVisible();
	await expect(p1.getByText('A holiday opened some of these before their week.')).toBeVisible();
	const visitor = await browser.newPage();
	await visitor.goto(`/seasons/${slug}/players/${player('holidayEarly', 1)}`);
	await expect(visitor.getByRole('listitem').filter({ hasText: 'HolidayEarly 4' })).toHaveCount(0);

	for (const id of [player('holidayEarly', 2), null]) {
		const someone = id ? await browser.newPage(as(id)) : await browser.newPage();
		expect((await someone.goto(`/seasons/${slug}/matches/${early}`))?.status()).toBe(404);
	}
	const org = await browser.newPage(as(ORGANIZER));
	expect((await org.goto(`/seasons/${slug}/matches/${early}`))?.status()).toBe(200);

	// The opponent isn't on holiday: the season page points them to it.
	const p4 = await browser.newPage(as(player('holidayEarly', 4)));
	await p4.goto(`/seasons/${slug}`);
	await expect(p4.getByText('A holiday opened one of your matches early.')).toBeVisible();
	await p4.getByRole('link', { name: 'Play before the week starts' }).click();
	await p4
		.getByRole('list', { name: 'Matches this season' })
		.getByRole('link', { name: /against HolidayEarly 1(?!\d).*Report result/ })
		.click();

	const game = (n: number) => p4.getByRole('radiogroup', { name: new RegExp(`^Game ${n}`) });
	await p4.getByLabel('Legend').nth(0).selectOption('Ahri');
	await p4.getByLabel('Legend').nth(1).selectOption('Annie');
	await p4
		.getByRole('group', { name: 'Who won the dice roll?' })
		.getByLabel('HolidayEarly 4')
		.check();
	await game(1).getByLabel('HolidayEarly 4').check();
	await game(2).getByLabel('HolidayEarly 4').check();
	await p4.getByRole('button', { name: 'Add result' }).click();
	await p4.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(p4.getByRole('status')).toContainText(
		'It stays hidden from everyone else until week 2 is published'
	);

	await p4.goto(`/seasons/${slug}`);
	await expect(p4.getByText('A holiday opened one of your matches early.')).toHaveCount(0);
	const standings = (
		(await (await fetch(`http://localhost:${PORT}/api/v1/seasons/${slug}`)).json()) as {
			groups: { standings: { played: number }[] }[];
		}
	).groups[0].standings.map((r) => r.played);
	expect(standings).toEqual([0, 0, 0, 0]);
	expect((await posts('results')).some((b) => b.embeds?.[0].title.includes('HolidayEarly 4'))).toBe(
		false
	);
});
