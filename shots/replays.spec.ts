// The replay panel in states the main pages don't show: a pressed Watch and the row menu, the upload
// form and its which-game step, one player's Publish, and a match whose games hold files that
// show one side or both.
import { test } from '@playwright/test';
import {
	freezeTimes,
	publishReplays,
	removeSeason,
	renamePlayer,
	seedReplay,
	seedResult,
	seedSeason
} from '../e2e/db.ts';
import { ORGANIZER, SEASONS, player } from '../e2e/fixtures.ts';
import { replayFile } from '../src/lib/server/test/replayFile.ts';
import { NOW, day } from './now.ts';
import { shot } from './shot.ts';

let mixed: number; // round 3: ShotsReplays 1 vs 4
test.afterAll(() => removeSeason('shotsReplays'));

test('a match with replays, after pressing Watch', async ({ browser }) => {
	let match: number;
	[match, , , , mixed] = seedSeason('shotsReplays', {
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
			await page.getByRole('link', { name: /^Watch .* of game 1 on RiftAtlas$/ }).click();
			await page.getByRole('status').waitFor();
			await page.getByLabel('More for your replay of game 3').click();
		}
	);
	const url = `/seasons/${SEASONS.shotsReplays}/matches/${match}`;
	await shot(browser, 'player-match-replays-upload', url, player('shotsReplays', 1), (page) =>
		page.getByText('Add or replace a replay').click()
	);
	// A second file that says "game 1": nothing is stored, so both views get the same step.
	await shot(
		browser,
		'player-match-replays-which',
		url,
		player('shotsReplays', 1),
		async (page) => {
			await page.getByText('Add or replace a replay').click();
			await page.getByLabel('Replay file').setInputFiles({
				name: 'riftatlas-replay-game-1.json',
				mimeType: 'application/json',
				buffer: Buffer.from(
					replayFile({ replayId: 'room2', legends: ['Ahri, Fox', 'Annie, Fire'], completedAt: NOW })
				)
			});
			await page.getByRole('button', { name: 'Upload' }).click();
			await page.getByRole('group', { name: 'Which game is this file?' }).waitFor();
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

// Game 1: a one-side file from each player of the same game. Game 2: one from the long-named
// player only, which hides the other's side. Game 3: one that shows both. Game 4: none.
test('a match whose files show one side or both', async ({ browser }) => {
	renamePlayer(player('shotsReplays', 4), 'Bartholomew Featherstonehaugh-Villanueva');
	seedResult(mixed, 2, 1, { games: '1D21' });
	seedReplay(mixed, 1, { side: 1, bothSides: false });
	seedReplay(mixed, 1, { side: 2, bothSides: false });
	seedReplay(mixed, 2, { side: 2, bothSides: false });
	seedReplay(mixed, 3, { side: 1 });
	freezeTimes(NOW);
	const url = `/seasons/${SEASONS.shotsReplays}/matches/${mixed}`;
	for (const [name, who] of [
		['player-match-replays-hidden-side', player('shotsReplays', 1)],
		['player-match-replays-mixed', player('shotsReplays', 4)],
		['org-match-replays-mixed', ORGANIZER]
	])
		await shot(browser, name, url, who);
});
