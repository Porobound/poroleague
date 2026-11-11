// The main pages, so a change that reaches one by accident shows up as a changed image.
import { test } from '@playwright/test';
import {
	freezeTimes,
	removeSeason,
	renamePlayer,
	seedAchievements,
	seedEmptySeason,
	seedEntries,
	seedFinishedGroups,
	seedPlayers,
	seedResult,
	seedSeason
} from '../e2e/db.ts';
import { ORGANIZER as org, SEASONS, as, player } from '../e2e/fixtures.ts';
import { NOW, day } from './now.ts';
import { shot } from './shot.ts';

test.setTimeout(300_000);
test.afterAll(() => {
	for (const key of ['shots', 'shotsDraft', 'shotsSignup', 'shotsCut'] as const) removeSeason(key);
});

test('a season in play', async ({ browser }) => {
	const s = `/seasons/${SEASONS.shots}`;
	const me = player('shots', 1);
	const [reported, , open, flagged] = seedSeason('shots', {
		publishedRound: 3,
		startDate: day(-7),
		deadline: day(30)
	});
	renamePlayer(player('shots', 2), 'Bartholomew Featherstonehaugh-Villanueva');
	seedResult(reported, 2, 1);
	seedResult(flagged, 0, 2, {
		flag: 'We played 2-1 but the second game was conceded after a misclick, so this needs a look.'
	});
	seedEmptySeason('shotsDraft', 'draft');
	// Seeds bypass the award. One finished legend track, one league tier and a one-off show every row state.
	seedAchievements(me, [
		'first-blood',
		'dice-bronze',
		'legend-renata-glasc-bronze',
		'legend-renata-glasc-silver',
		'legend-renata-glasc-gold'
	]);
	freezeTimes(NOW);
	const pages: [string, string, string?][] = [
		['visitor-seasons', '/seasons'],
		['visitor-rules', '/rules'],
		['visitor-privacy', '/privacy'],
		['visitor-season', s],
		['visitor-schedule', `${s}/schedule`],
		['visitor-legends', `${s}/legends`],
		['visitor-audit', `${s}/audit`],
		['visitor-player', `${s}/players/${me}`],
		['visitor-career', `/players/${me}`],
		['visitor-match-reported', `${s}/matches/${reported}`],
		['visitor-match-flagged', `${s}/matches/${flagged}`],
		['visitor-login-not-member', '/login/not-member'],
		['visitor-login-failed', '/login/failed'],
		['player-season', s, me],
		['player-schedule', `${s}/schedule`, me],
		['player-own-page', `${s}/players/${me}`, me],
		['player-match-open', `${s}/matches/${open}`, me],
		['player-match-reported', `${s}/matches/${reported}`, me],
		['player-login-not-organizer', '/login/not-organizer', me],
		['org-admin', '/admin', org],
		['org-admin-players', '/admin/players', org],
		['org-season', `${s}/admin`, org],
		['org-season-players', `${s}/admin/players`, org],
		['org-season-groups', `${s}/admin/groups`, org],
		['org-season-matches', `${s}/admin/matches`, org],
		['org-season-settings', `${s}/admin/season`, org],
		['org-draft-settings', `/seasons/${SEASONS.shotsDraft}/admin/season`, org],
		['org-match-reported', `${s}/matches/${reported}`, org],
		['org-match-flagged', `${s}/matches/${flagged}`, org]
	];
	for (const [name, path, who] of pages) await shot(browser, name, path, who);
});

// Only one season can be running, so these follow the one above.
test('signup', async ({ browser }) => {
	removeSeason('shots');
	seedPlayers('shotsSignup', 6);
	seedEmptySeason('shotsSignup', 'signup');
	seedEntries('shotsSignup', 1, 6);
	freezeTimes(NOW);
	await shot(browser, 'visitor-signup', `/seasons/${SEASONS.shotsSignup}`);
});

test('top cut setup', async ({ browser }) => {
	removeSeason('shotsSignup');
	seedFinishedGroups('shotsCut', 2, [day(-30), day(-2)]);
	freezeTimes(NOW);
	const s = `/seasons/${SEASONS.shotsCut}`;
	await shot(browser, 'visitor-topcut-groups-done', s);
	await shot(browser, 'org-topcut-setup', `${s}/admin/top-cut`, org);
	// One semifinal walked over, so the bracket shows a decided and an open match.
	const page = await browser.newPage(as(org));
	await page.goto(`${s}/admin/top-cut`);
	await page.getByRole('button', { name: 'Publish top cut' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Publish top cut' }).click();
	await page.getByRole('button', { name: 'Walkover', exact: true }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Advance a player without playing?' });
	await dialog.getByRole('radio').first().check();
	await dialog.getByRole('button', { name: 'Advance' }).click();
	await page.getByRole('status').waitFor();
	await page.close();
	freezeTimes(NOW);
	await shot(browser, 'visitor-topcut', `${s}/top-cut`);
});
