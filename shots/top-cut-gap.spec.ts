// A player's page in a season with a top cut: the gap to the cut and a run of results.
import { test } from '@playwright/test';
import { freezeTimes, removeSeason, seedResult, seedSeason } from '../e2e/db.ts';
import { SEASONS, player } from '../e2e/fixtures.ts';
import { NOW, day } from './now.ts';
import { shot } from './shot.ts';

const s = `/seasons/${SEASONS.shotsHero}`;

test.afterAll(() => removeSeason('shotsHero'));

// Top 2 of 4 advance; two rounds played. Player 1 leads on two wins, player 4 has lost both.
test('inside and outside the top cut', async ({ browser }) => {
	const [m12, m34, m13, m24] = seedSeason('shotsHero', {
		publishedRound: 2,
		startDate: day(-7),
		deadline: day(30),
		topCut: 2
	});
	seedResult(m12, 2, 0);
	seedResult(m34, 2, 0);
	seedResult(m13, 2, 0);
	seedResult(m24, 2, 1);
	freezeTimes(NOW);
	await shot(browser, 'visitor-player-in-cut', `${s}/players/${player('shotsHero', 1)}`);
	await shot(browser, 'visitor-player-off-cut', `${s}/players/${player('shotsHero', 4)}`);
});
