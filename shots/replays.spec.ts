// The replay panel in states the main pages don't show: a pressed Watch and the row menu, and one
// player's Publish.
import { test } from '@playwright/test';
import {
	freezeTimes,
	publishReplays,
	removeSeason,
	seedReplay,
	seedResult,
	seedSeason
} from '../e2e/db.ts';
import { ORGANIZER, SEASONS, player } from '../e2e/fixtures.ts';
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
	// One player has pressed Publish: what that player, the other one and an organizer see.
	publishReplays(match, true, false);
	for (const [name, who] of [
		['player-match-replays-waiting', player('shotsReplays', 1)],
		['player-match-replays-asked', player('shotsReplays', 2)],
		['org-match-replays-one-published', ORGANIZER]
	])
		await shot(browser, name, `/seasons/${SEASONS.shotsReplays}/matches/${match}`, who);
});
