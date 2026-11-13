import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { replayFile } from '../src/lib/server/test/replayFile.ts';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.replays;
let match: number; // round 1: Replays 1 vs Replays 2, reported 2–1, Ahri vs Annie
let open: number; // round 2: Replays 1 vs Replays 3, unreported
const url = () => `/seasons/${slug}/matches/${match}`;
const [p1, p2] = [playerName('replays', 1), playerName('replays', 2)];
// Dated now, after the season was seeded: an older game can't be this season's.
const file = (legends?: string[], replayId?: string) =>
	replayFile({ legends, replayId, completedAt: Date.now() });
const upload = async (page: Page, text: string, game?: string) => {
	await page.getByLabel('Replay file from RiftAtlas').setInputFiles({
		name: 'replay.json',
		mimeType: 'application/json',
		buffer: Buffer.from(text)
	});
	if (game) await page.getByLabel('Which game is it?').selectOption(game);
	await page.getByRole('button', { name: 'Add replay' }).click();
};
const replays = (page: Page) => page.getByRole('region', { name: 'Replays' });

test.beforeAll(() => {
	[match, , open] = seedSeason('replays', { publishedRound: 3 });
	seedResult(match, 2, 1);
});
test.afterAll(() => removeSeason('replays'));

test('upload, watch, and who can see a replay', async ({ browser }) => {
	const game1 = file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child']);
	const uploader = await browser.newPage(as(player('replays', 1)));
	await uploader.goto(url());
	await expect(replays(uploader).getByRole('listitem')).toHaveCount(0);

	// A file of other legends isn't this match.
	await upload(uploader, file());
	await expect(uploader.getByRole('status')).toHaveText(
		'This replay is Azir vs Evelynn, but the match was reported as Ahri vs Annie.'
	);
	await upload(uploader, 'hello');
	await expect(uploader.getByRole('status')).toContainText("isn't a RiftAtlas replay file");

	await upload(uploader, game1);
	await expect(uploader.getByRole('status')).toHaveText(
		`Replay saved. Only you and ${p2} can see it.`
	);
	await expect(replays(uploader).getByRole('listitem')).toHaveText(
		new RegExp(`Game 1\\s+from ${p1}`)
	);

	// The opponent gets the file back as uploaded; Watch saves it and opens RiftAtlas.
	const context = await browser.newContext(as(player('replays', 2)));
	await context.route('https://play.riftatlas.com/**', (r) => r.fulfill({ body: 'RiftAtlas' }));
	const opponent = await context.newPage();
	await opponent.goto(url());
	const [download, popup] = await Promise.all([
		opponent.waitForEvent('download'),
		opponent.waitForEvent('popup'),
		replays(opponent).getByRole('link', { name: 'Watch game 1' }).click()
	]);
	expect(download.suggestedFilename()).toBe(`poroleague-${slug}-match-${match}-game-1.json`);
	expect(popup.url()).toBe('https://play.riftatlas.com/?replayFile=1');
	// It travels gzipped; what lands on disk is the JSON.
	expect(readFileSync(await download.path(), 'utf8')).toBe(game1);
	const got = await opponent.request.get(`${url()}/replay/1`);
	expect(got.headers()['content-encoding']).toBe('gzip');
	expect(await got.text()).toBe(game1);

	// The series moved to a new room, whose first game also says "game 1": it replaces nothing
	// until the player says which game it is.
	const room2 = file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child'], 'ROOM2:1');
	await upload(uploader, room2);
	await expect(uploader.getByRole('status')).toContainText('Game 1 already has another replay.');
	await upload(uploader, room2, 'Game 2');
	await expect(replays(uploader).getByRole('listitem')).toHaveCount(2);
	expect(await (await opponent.request.get(`${url()}/replay/1`)).text()).toBe(game1);
	// The same form sent again changes nothing.
	await uploader.reload();
	await expect(replays(uploader).getByRole('listitem')).toHaveCount(2);

	// The public log says nothing of replays; the organizer's does.
	await opponent.goto(`/seasons/${slug}/audit`);
	await expect(opponent.getByText(p1).first()).toBeVisible();
	await expect(opponent.getByText('replay uploaded')).toHaveCount(0);

	// Nobody else sees it or can fetch it: not another player, not a visitor.
	for (const options of [as(player('replays', 3)), {}]) {
		const other = await browser.newPage(options);
		await other.goto(url());
		await expect(other.getByRole('heading', { name: `${p1} vs ${p2}` })).toBeVisible();
		await expect(replays(other)).toHaveCount(0);
		expect((await other.request.get(`${url()}/replay/1`)).status()).toBe(404);
		await other.close();
	}

	// An organizer sees it and can delete it, but adds none.
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(url());
	await expect(org.getByLabel('Replay file from RiftAtlas')).toHaveCount(0);
	for (const game of [1, 2]) {
		await replays(org).getByRole('button', { name: 'Delete' }).first().click();
		await org.getByRole('dialog').getByRole('button', { name: 'Delete replay' }).click();
		await expect(org.getByRole('status')).toHaveText(`Game ${game} replay deleted.`);
	}
	await expect(replays(org)).toHaveCount(0);
	await org.goto(`/seasons/${slug}/audit`);
	await expect(org.getByText('Game 2 replay uploaded')).toBeVisible();
	expect((await opponent.request.get(`${url()}/replay/1`)).status()).toBe(404);
});

test('the report form reminds players to save the replay', async ({ browser }) => {
	const page = await browser.newPage(as(player('replays', 1)));
	await page.goto(`/seasons/${slug}/matches/${open}`);
	await expect(
		page.getByText('Download the replay JSON of each game within 6 hours')
	).toBeVisible();
	await expect(replays(page)).toHaveCount(0);
});
