// The replay panel as a player uses it: a pressed Watch and the row menu, which no plain page load shows.
import { test } from '@playwright/test';
import { freezeTimes, removeSeason, seedReplay, seedResult, seedSeason } from '../e2e/db.ts';
import { SEASONS, player } from '../e2e/fixtures.ts';
import { NOW, day } from './now.ts';
import { shot } from './shot.ts';

test.afterAll(() => removeSeason('shotsReplays'));

test('a match with replays, after pressing Watch', async ({ browser }) => {
	const [match] = seedSeason('shotsReplays', {
		publishedRound: 3,
		startDate: day(-7),
		deadline: day(30)
	});
	seedResult(match, 2, 1);
	seedReplay(match, 1);
	seedReplay(match, 3);
	freezeTimes(NOW);
	await shot(
		browser,
		'player-match-replays-watched',
		`/seasons/${SEASONS.shotsReplays}/matches/${match}`,
		player('shotsReplays', 1),
		async (page) => {
			await page.getByRole('link', { name: 'Watch game 1' }).click();
			await page.getByRole('status').waitFor();
			await page.getByLabel('More for game 3').click();
		}
	);
});
