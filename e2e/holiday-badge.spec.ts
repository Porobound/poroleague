// The On holiday badge and name tags: who sees them, and where.
import { expect, test } from '@playwright/test';
import { removeSeason, seedHoliday, seedSeason } from './db.ts';
import { SEASONS, as, player } from './fixtures.ts';

const slug = SEASONS.holidayBadge;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let early: number; // round 3: HolidayBadge 1 vs HolidayBadge 4

// Week 1 (rounds 1–2) is published and running; HolidayBadge 1 is away this week and next.
test.beforeAll(() => {
	early = seedSeason('holidayBadge', {
		publishedRound: 2,
		startDate: day(-3),
		deadline: day(20)
	})[4];
	seedHoliday('holidayBadge', 1, day(-1), day(6), 'approved');
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
