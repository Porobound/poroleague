// Publishing a week brings its early results out: Discord, standings, the match page, the audit log.
import { expect, test } from '@playwright/test';
import { removeSeason, seedHoliday, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, PORT, SEASONS, as, posts } from './fixtures.ts';

const slug = SEASONS.holidayPublish;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const TITLE = 'HolidayPublish 1 0–2 HolidayPublish 4';
let early: number; // round 3: HolidayPublish 1 vs HolidayPublish 4

// Two rounds a week: week 1 (rounds 1–2) is published; the week 2 match is already played.
test.beforeAll(() => {
	early = seedSeason('holidayPublish', {
		publishedRound: 2,
		startDate: day(-3),
		deadline: day(20)
	})[4];
	seedHoliday('holidayPublish', 1, day(5), day(6), 'approved');
	seedResult(early, 0, 2);
});
test.afterAll(() => removeSeason('holidayPublish'));

test('publishing the week posts the early result once and shows it everywhere', async ({
	browser
}) => {
	const posted = async () =>
		(await posts('results')).filter((b) => b.embeds?.[0].title === TITLE).length;
	const played = async () =>
		(
			(await (await fetch(`http://localhost:${PORT}/api/v1/seasons/${slug}`)).json()) as {
				groups: { standings: { played: number }[] }[];
			}
		).groups[0].standings.map((r) => r.played);
	const visitor = await browser.newPage();
	expect((await visitor.goto(`/seasons/${slug}/matches/${early}`))?.status()).toBe(404);
	expect(await played()).toEqual([0, 0, 0, 0]);

	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/admin`);
	await org.getByRole('button', { name: 'Publish week 2' }).click();
	await org.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
	await expect(org.getByRole('status')).toContainText('Week 2 published');

	await expect.poll(posted).toBe(1);
	expect(await played()).toContain(1);
	await visitor.goto(`/seasons/${slug}/matches/${early}`);
	await expect(
		visitor.getByRole('heading', { level: 1, name: 'HolidayPublish 1 vs HolidayPublish 4' })
	).toBeVisible();
	await visitor.goto(`/seasons/${slug}/audit`);
	await expect(visitor.getByText(/HolidayPublish 1 0–2 HolidayPublish 4/)).toBeVisible();
});
