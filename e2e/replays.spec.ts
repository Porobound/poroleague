import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { replayFile } from '../src/lib/server/test/replayFile.ts';
import { removeSeason, seedReplay, seedResult, seedSeason } from './db.ts';
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
// One row per played game; a pressed Watch adds its own list of steps.
const rows = (page: Page) =>
	replays(page)
		.getByRole('listitem')
		.filter({ hasText: /^Game \d/ });
const badge = (page: Page, text: 'Private' | 'Public') =>
	replays(page).getByText(text, { exact: true });

test.beforeAll(() => {
	[match, , open] = seedSeason('replays', { publishedRound: 3 });
	seedResult(match, 2, 1);
});
test.afterAll(() => removeSeason('replays'));

test('upload, watch, and who can see a replay', async ({ browser }) => {
	const game1 = file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child']);
	const uploader = await browser.newPage(as(player('replays', 1)));
	await uploader.goto(url());
	await expect(rows(uploader)).toHaveCount(0);
	await expect(
		replays(uploader).getByText('RiftAtlas deletes replays after 6 hours')
	).toBeVisible();
	await expect(badge(uploader, 'Private')).toHaveCount(0);

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
	// Every played game has a row; the ones without a replay have nothing to press.
	await expect(rows(uploader)).toHaveText([
		new RegExp(`^Game 1\\s*Added by ${p1} · \\w{3} \\d+ \\w{3}`),
		/^Game 2\s*No replay\s*$/,
		/^Game 3\s*No replay\s*$/
	]);
	await expect(rows(uploader).nth(1).getByRole('link')).toHaveCount(0);
	await expect(rows(uploader).nth(1).getByRole('button')).toHaveCount(0);
	await expect(badge(uploader, 'Private')).toBeVisible();
	await expect(
		replays(uploader).getByText('Watch saves the replay file and opens RiftAtlas in a new tab.')
	).toBeVisible();

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
	const name = `poroleague-${slug}-match-${match}-game-1.json`;
	expect(download.suggestedFilename()).toBe(name);
	expect(popup.url()).toBe('https://play.riftatlas.com/?replayFile=1');
	// It travels gzipped; what lands on disk is the JSON.
	expect(readFileSync(await download.path(), 'utf8')).toBe(game1);
	const got = await opponent.request.get(`${url()}/replay/1`);
	expect(got.headers()['content-encoding']).toBe('gzip');
	expect(await got.text()).toBe(game1);
	// The row then says where the file went and what to do with it.
	const next = rows(opponent).first().getByRole('status');
	await expect(next).toContainText(`Saved to your downloads as ${name}.`);
	await expect(next.getByRole('link', { name: 'Open RiftAtlas' })).toHaveAttribute(
		'href',
		'https://play.riftatlas.com/?replayFile=1'
	);
	const [again] = await Promise.all([
		opponent.waitForEvent('download'),
		next.getByRole('link', { name: 'Download again' }).click()
	]);
	expect(again.suggestedFilename()).toBe(name);

	// The series moved to a new room, whose first game also says "game 1": it replaces nothing
	// until the player says which game it is.
	const room2 = file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child'], 'ROOM2:1');
	await upload(uploader, room2);
	await expect(uploader.getByRole('status')).toContainText('Game 1 already has another replay.');
	await upload(uploader, room2, 'Game 2');
	await expect(rows(uploader).filter({ hasText: 'Added by' })).toHaveCount(2);
	expect(await (await opponent.request.get(`${url()}/replay/1`)).text()).toBe(game1);
	// The same form sent again changes nothing.
	await uploader.reload();
	await expect(rows(uploader).filter({ hasText: 'Added by' })).toHaveCount(2);

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

	// A player deletes through the row's menu.
	await expect(replays(uploader).getByRole('button', { name: 'Delete replay' })).toBeHidden();
	await uploader.getByLabel('More for game 2').click();
	await replays(uploader).getByRole('button', { name: 'Delete replay' }).click();
	await uploader.getByRole('dialog').getByRole('button', { name: 'Delete replay' }).click();
	await expect(uploader.getByRole('status')).toHaveText('Game 2 replay deleted.');
	await expect(rows(uploader).nth(1)).toHaveText(/No replay\s*$/);

	// An organizer sees it and can delete it straight from the row, but adds none.
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(url());
	await expect(org.getByLabel('Replay file from RiftAtlas')).toHaveCount(0);
	await expect(badge(org, 'Private')).toBeVisible();
	await expect(org.getByLabel('More for game 1')).toHaveCount(0);
	await replays(org).getByRole('button', { name: 'Delete game 1 replay' }).click();
	await org.getByRole('dialog').getByRole('button', { name: 'Delete replay' }).click();
	await expect(org.getByRole('status')).toHaveText('Game 1 replay deleted.');
	await expect(replays(org).getByText('No replays yet.', { exact: true })).toBeVisible();
	await expect(badge(org, 'Private')).toHaveCount(0);
	await org.goto(`/seasons/${slug}/audit`);
	await expect(org.getByText('Game 2 replay uploaded')).toBeVisible();
	expect((await opponent.request.get(`${url()}/replay/1`)).status()).toBe(404);
});

test('replays go public once both players publish', async ({ browser }) => {
	seedReplay(match, 1);
	const publish = async (page: Page) => {
		await page.getByRole('button', { name: 'Publish', exact: true }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
	};
	const visitor = await browser.newPage();
	const chip = visitor.getByText('Replay available');
	const isPublic = async (yes: boolean) => {
		await visitor.goto(url());
		await expect(replays(visitor)).toHaveCount(yes ? 1 : 0);
		expect((await visitor.request.get(`${url()}/replay/1`)).status()).toBe(yes ? 200 : 404);
		await visitor.goto(`/seasons/${slug}/schedule`);
		await expect(visitor.getByText(p1).first()).toBeVisible();
		await expect(chip).toHaveCount(yes ? 1 : 0);
	};

	// One yes isn't enough, and the page tells each player where things stand.
	const one = await browser.newPage(as(player('replays', 1)));
	await one.goto(url());
	await expect(one.getByText(`Private: only you and ${p2} can watch these replays.`)).toBeVisible();
	await expect(one.getByText(`Talk to ${p2} first`)).toBeVisible();
	await publish(one);
	await expect(one.getByRole('status')).toHaveText(
		`You said yes. The replays go public once ${p2} publishes too.`
	);
	await isPublic(false);

	const two = await browser.newPage(as(player('replays', 2)));
	await two.goto(url());
	await expect(two.getByText(`${p1} wants to publish these replays.`)).toBeVisible();
	await expect(badge(two, 'Private')).toBeVisible();
	await publish(two);
	await expect(two.getByRole('status')).toHaveText('Published. Anyone can watch the replays now.');
	await expect(badge(two, 'Public')).toBeVisible();
	await isPublic(true);

	// A visitor watches but changes nothing.
	await visitor.goto(url());
	await expect(replays(visitor).getByRole('link', { name: 'Watch game 1' })).toBeVisible();
	await expect(replays(visitor).getByRole('button')).toHaveCount(0);
	await expect(badge(visitor, 'Public')).toHaveCount(0);

	// A new file is not what the two agreed to publish.
	await upload(two, file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child']), 'Game 1');
	await expect(two.getByText(`Private: only you and ${p1} can watch these replays.`)).toBeVisible();
	await isPublic(false);

	// Either player can take a yes back.
	await publish(two);
	await one.reload();
	await publish(one);
	await isPublic(true);
	await one.getByRole('button', { name: 'Unpublish' }).click();
	await one.getByRole('dialog').getByRole('button', { name: 'Unpublish' }).click();
	await expect(one.getByRole('status')).toHaveText(
		`Unpublished. Only you and ${p2} see the replays.`
	);
	await isPublic(false);
});

test('the report form reminds players to save the replay', async ({ browser }) => {
	const page = await browser.newPage(as(player('replays', 1)));
	await page.goto(`/seasons/${slug}/matches/${open}`);
	await expect(
		page.getByText('Download the replay JSON of each game within 6 hours')
	).toBeVisible();
	await expect(replays(page)).toHaveCount(0);
});
