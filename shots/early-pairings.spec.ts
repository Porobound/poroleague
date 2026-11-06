// Pairings published before their week starts.
import { test } from '@playwright/test';
import { freezeTimes, removeSeason, seedSeason } from '../e2e/db.ts';
import { SEASONS, player } from '../e2e/fixtures.ts';
import { NOW, day } from './now.ts';
import { shot } from './shot.ts';

const s = `/seasons/${SEASONS.shotsEarly}`;
const me = player('shotsEarly', 2);

test.afterAll(() => removeSeason('shotsEarly'));

test('next week published early', async ({ browser }) => {
	seedSeason('shotsEarly', { publishedRound: 3, startDate: day(0), deadline: day(30) });
	freezeTimes(NOW);
	await shot(browser, 'player-season-up-next', s, me);
	await shot(browser, 'player-own-page-up-next', `${s}/players/${me}`, me);
});

test('week 1 published before the start date', async ({ browser }) => {
	seedSeason('shotsEarly', { publishedRound: 2, startDate: day(3), deadline: day(30) });
	freezeTimes(NOW);
	await shot(browser, 'player-season-before-start', s, me);
});
