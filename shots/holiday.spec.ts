// Holiday mode: requests, the organizer's Holidays section, matches unlocked early (and a
// revoked holiday's), and the end of the season waiting for every week to be published.
import { test } from '@playwright/test';
import {
	freezeTimes,
	publishReplays,
	removeSeason,
	seedHoliday,
	seedReplay,
	seedResult,
	seedSeason
} from '../e2e/db.ts';
import { ORGANIZER as org, SEASONS, player } from '../e2e/fixtures.ts';
import { NOW, day } from './now.ts';
import { shot } from './shot.ts';

const s = `/seasons/${SEASONS.shotsHoliday}`;
const [p1, p2, p3] = [1, 2, 3].map((n) => player('shotsHoliday', n));

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
	seedHoliday('shotsHoliday', 3, day(5), day(6), 'revoked');
	freezeTimes(NOW);
	await shot(browser, 'player-holiday-pending', `${s}/players/${p2}`, p2);
	await shot(browser, 'org-season-holidays', `${s}/admin/season`, org);
	await shot(browser, 'player-holiday-unlocked', `${s}/players/${p1}`, p1);
	await shot(browser, 'player-match-early', `${s}/matches/${ids[4]}`, p1);
	await shot(browser, 'player-holiday-revoked', `${s}/players/${p3}`, p3);
	seedResult(ids[4], 2, 1);
	// A private replay the opponent has agreed to publish: the Publish button and its advice.
	seedReplay(ids[4], 1);
	publishReplays(ids[4], false, true);
	freezeTimes(NOW);
	await shot(browser, 'player-match-early-reported', `${s}/matches/${ids[4]}`, p1);
});

test('a week left unpublished at the deadline', async ({ browser }) => {
	seedSeason('shotsHoliday', { publishedRound: 2, startDate: day(-20), deadline: day(-1) });
	freezeTimes(NOW);
	await shot(browser, 'org-season-unpublished-week', `${s}/admin/season`, org);
});
