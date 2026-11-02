// The On holiday badge and name tags: who sees them, and where.
import { expect, test } from '@playwright/test';
import { removeSeason, seedHoliday, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player } from './fixtures.ts';

const slug = SEASONS.holidayBadge;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let early: number; // round 3: HolidayBadge 1 vs HolidayBadge 4
let other: number; // round 3: HolidayBadge 2 vs HolidayBadge 3

// Week 1 (rounds 1–2) is published and running; HolidayBadge 1 is away this week and next, and
// HolidayBadge 2's holiday for next week was revoked.
test.beforeAll(() => {
	[early, other] = seedSeason('holidayBadge', {
		publishedRound: 2,
		startDate: day(-3),
		deadline: day(20)
	}).slice(4);
	seedHoliday('holidayBadge', 1, day(-1), day(6), 'approved');
	seedHoliday('holidayBadge', 2, day(5), day(6), 'revoked');
});
test.afterAll(() => removeSeason('holidayBadge'));

test('a visitor sees the badge; the opponent sees the tag down to the report form', async ({
	browser
}) => {
	const visitor = await browser.newPage();
	await visitor.goto(`/seasons/${slug}/players/${player('holidayBadge', 1)}`);
	await expect(visitor.getByText(/^On holiday · /)).toBeVisible();
	await visitor.goto(`/seasons/${slug}/players/${player('holidayBadge', 2)}`);
	await expect(visitor.getByText(/^On holiday · /)).toHaveCount(0);
	// Their week 1 pairing with HolidayBadge 1 carries the tag on the card.
	await expect(visitor.getByText('On holiday').first()).toBeVisible();

	const p4 = await browser.newPage(as(player('holidayBadge', 4)));
	await p4.goto(`/seasons/${slug}/players/${player('holidayBadge', 4)}`);
	await expect(
		p4.getByRole('region', { name: 'Unlocked early' }).getByText('On holiday')
	).toBeVisible();
	await p4.goto(`/seasons/${slug}/matches/${early}`);
	await expect(p4.getByRole('button', { name: 'Add result' })).toBeVisible();
	await expect(p4.getByText('On holiday')).toHaveCount(1);
});

test('a revoked holiday leaves its unlocked match tagged Holiday revoked', async ({ browser }) => {
	const p3 = await browser.newPage(as(player('holidayBadge', 3)));
	await p3.goto(`/seasons/${slug}/players/${player('holidayBadge', 3)}`);
	const unlocked = p3.getByRole('region', { name: 'Unlocked early' });
	await expect(unlocked.getByText('Holiday revoked')).toBeVisible();
	await expect(unlocked.getByText('On holiday')).toHaveCount(0);
	// The organizer's view of the match has no report form, only the card.
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/matches/${other}`);
	await expect(org.getByText('Holiday revoked')).toBeVisible();
});
