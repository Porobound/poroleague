// Holiday mode: a player's requests.
import { test } from '@playwright/test';
import { freezeTimes, removeSeason, seedHoliday, seedSeason } from '../e2e/db.ts';
import { SEASONS, player } from '../e2e/fixtures.ts';
import { NOW, day } from './now.ts';
import { shot } from './shot.ts';

const s = `/seasons/${SEASONS.shotsHoliday}`;
const p2 = player('shotsHoliday', 2);

test.afterAll(() => removeSeason('shotsHoliday'));

// Two rounds a week: week 1 (rounds 1–2) is published, week 2 (round 3) runs day 4 to day 10.
test('holidays', async ({ browser }) => {
	seedSeason('shotsHoliday', { publishedRound: 2, startDate: day(-3), deadline: day(20) });
	seedHoliday('shotsHoliday', 2, day(5), day(6));
	freezeTimes(NOW);
	await shot(browser, 'player-holiday-pending', `${s}/players/${p2}`, p2);
});
