// Holiday mode: requests, the organizer's Holidays section and matches unlocked early.
import { test } from '@playwright/test';
import { freezeTimes, removeSeason, seedHoliday, seedSeason } from '../e2e/db.ts';
import { ORGANIZER as org, SEASONS, player } from '../e2e/fixtures.ts';
import { NOW, day } from './now.ts';
import { shot } from './shot.ts';

const s = `/seasons/${SEASONS.shotsHoliday}`;
const [p1, p2] = [player('shotsHoliday', 1), player('shotsHoliday', 2)];

test.afterAll(() => removeSeason('shotsHoliday'));

// Two rounds a week: week 1 (rounds 1–2) is published, week 2 (round 3) runs day 4 to day 10.
test('holidays', async ({ browser }) => {
	const ids = seedSeason('shotsHoliday', {
		publishedRound: 2,
		startDate: day(-3),
		deadline: day(20)
	});
	seedHoliday('shotsHoliday', 1, day(-1), day(6), 'approved');
	seedHoliday('shotsHoliday', 2, day(5), day(6));
	freezeTimes(NOW);
	await shot(browser, 'player-holiday-pending', `${s}/players/${p2}`, p2);
	await shot(browser, 'org-season-holidays', `${s}/admin/season`, org);
	await shot(browser, 'player-holiday-unlocked', `${s}/players/${p1}`, p1);
	await shot(browser, 'player-match-early', `${s}/matches/${ids[4]}`, p1);
});
