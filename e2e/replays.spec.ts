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
const replays = (page: Page) => page.getByRole('region', { name: 'Replays' });
// The button that opens the upload form: "Add a replay" until the match has one.
const opener = (page: Page) => replays(page).getByText(/^Add( or replace)? a replay$/);
const field = (page: Page) => page.getByLabel('Replay file');
const choose = (page: Page, text: string) =>
	field(page).setInputFiles({
		name: 'replay.json',
		mimeType: 'application/json',
		buffer: Buffer.from(text)
	});
const which = (page: Page) => page.getByRole('group', { name: 'Which game is this file?' });
// Opens the form if it is closed and sends the file; `game` answers the which-game step.
const upload = async (page: Page, text: string, game?: string) => {
	if (!(await field(page).isVisible())) await opener(page).click();
	await choose(page, text);
	await page.getByRole('button', { name: 'Upload' }).click();
	if (!game) return;
	await which(page).getByRole('radio', { name: game }).check();
	await page.getByRole('button', { name: 'Save replay' }).click();
};
// One row per played game; a pressed Watch adds its own list of steps.
const rows = (page: Page) =>
	replays(page)
		.getByRole('listitem')
		.filter({ hasText: /^Game \d/ });
// The header's badge; a player's publish box repeats the word after it.
const badge = (page: Page, text: 'Private' | 'Public') =>
	replays(page).getByText(text, { exact: true }).first();

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
	// The form opens on demand.
	await expect(opener(uploader)).toHaveText('Add a replay');
	await expect(field(uploader)).toBeHidden();

	// A file of other legends isn't this match: the form stays open, the field marked.
	await upload(uploader, file());
	await expect(uploader.getByRole('status')).toHaveText(
		'This replay is Azir vs Evelynn, but the match was reported as Ahri vs Annie.'
	);
	await expect(field(uploader)).toBeVisible();
	await expect(field(uploader)).toHaveAttribute('aria-invalid', 'true');
	await expect(rows(uploader)).toHaveCount(0);
	await upload(uploader, 'hello');
	await expect(uploader.getByRole('status')).toContainText("isn't a RiftAtlas replay file");

	// An empty slot takes the file straight away, and the form closes.
	await upload(uploader, game1);
	await expect(uploader.getByRole('status')).toHaveText(
		'Replay added for game 1. Replays stay private until you both publish.'
	);
	await expect(field(uploader)).toBeHidden();
	await expect(opener(uploader)).toHaveText('Add or replace a replay');
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
	await expect(uploader.getByRole('status')).toHaveText(
		'Game 1 already has another replay. Choose which game this file is.'
	);
	// The file is kept; the form now asks only for the game.
	await expect(field(uploader)).toBeHidden();
	await expect(which(uploader).getByText('replay.json')).toBeVisible();
	await expect(which(uploader).getByRole('radio')).toHaveCount(3);
	await expect(
		which(uploader).getByRole('radio', { name: `Game 1 Replaces the replay added by ${p1}` })
	).toBeVisible();
	const save = uploader.getByRole('button', { name: 'Save replay' });
	await expect(save).toBeDisabled();
	await expect(rows(uploader).filter({ hasText: 'Added by' })).toHaveCount(1);
	await which(uploader).getByRole('radio', { name: 'Game 2 No replay yet' }).check();
	await save.click();
	await expect(uploader.getByRole('status')).toHaveText(
		'Replay added for game 2. Replays stay private until you both publish.'
	);
	await expect(rows(uploader).filter({ hasText: 'Added by' })).toHaveCount(2);
	expect(await (await opponent.request.get(`${url()}/replay/1`)).text()).toBe(game1);
	expect(await (await opponent.request.get(`${url()}/replay/2`)).text()).toBe(room2);

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
	// Nobody has pressed Publish, so deleting takes nothing back.
	await expect(uploader.getByRole('dialog')).toHaveText(/This can't be undone\.\s*Cancel/);
	await uploader.getByRole('dialog').getByRole('button', { name: 'Delete replay' }).click();
	await expect(uploader.getByRole('status')).toHaveText('Game 2 replay deleted.');
	await expect(rows(uploader).nth(1)).toHaveText(/No replay\s*$/);

	// An organizer sees it and can delete it straight from the row, but adds none.
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(url());
	await expect(opener(org)).toHaveCount(0);
	await expect(field(org)).toHaveCount(0);
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
	// Presses the publish box's button and confirms the dialog, which says what `says`.
	const press = async (page: Page, button: string, title: string, ...says: string[]) => {
		await replays(page).getByRole('button', { name: button, exact: true }).click();
		const dialog = page.getByRole('dialog', { name: title });
		for (const line of says) await expect(dialog.getByText(line)).toBeVisible();
		await dialog.getByRole('button', { name: button, exact: true }).click();
	};
	const publish = (page: Page, says: string) =>
		press(page, 'Publish', 'Publish these replays?', says, 'Either of you can take it back.');
	const visitor = await browser.newPage();
	const chip = visitor.getByText('Replay available');
	const isPublic = async (yes: boolean) => {
		await visitor.goto(url());
		await expect(replays(visitor)).toHaveCount(yes ? 1 : 0);
		expect((await visitor.request.get(`${url()}/replay/1`)).status()).toBe(yes ? 200 : 404);
		// The marker is on the match's row, on the schedule and on a player's page.
		for (const [path, names] of [
			['schedule', [p1, p2]],
			[`players/${player('replays', 1)}`, [p2]]
		] as const) {
			await visitor.goto(`/seasons/${slug}/${path}`);
			let row = visitor.getByRole('link');
			for (const hasText of names) row = row.filter({ hasText });
			await expect(row).toHaveCount(1);
			await expect(row.getByText('Replay available')).toHaveCount(yes ? 1 : 0);
			await expect(chip).toHaveCount(yes ? 1 : 0);
		}
	};
	// The organizer is told who pressed, and has nothing to press.
	const org = await browser.newPage(as(ORGANIZER));
	const orgSees = async (line: string) => {
		await org.goto(url());
		await expect(replays(org).getByText(line, { exact: true })).toBeVisible();
		await expect(replays(org).getByRole('button', { name: /publish|take it back/i })).toHaveCount(
			0
		);
	};
	const PRIVATE = (them: string) => [
		`Only you, ${them} and organizers can open these replays.`,
		`A replay shows the uploader's whole deck and hand. Agree with ${them} before you publish.`
	];

	// Private: one Publish isn't enough, and the box tells each player where things stand.
	const one = await browser.newPage(as(player('replays', 1)));
	await one.goto(url());
	for (const line of PRIVATE(p2)) await expect(replays(one).getByText(line)).toBeVisible();
	await orgSees('Neither player has pressed Publish.');
	await publish(one, `Everyone can watch once ${p2} presses Publish too.`);
	await expect(one.getByRole('status')).toHaveText(
		`You pressed Publish. The replays go public when ${p2} does too.`
	);
	await expect(replays(one).getByText(`Waiting for ${p2}`, { exact: true })).toBeVisible();
	await expect(
		replays(one).getByText(`The replays go public when ${p2} presses Publish too.`)
	).toBeVisible();
	await expect(badge(one, 'Private')).toBeVisible();
	await isPublic(false);
	await orgSees(`${p1} pressed Publish; ${p2} hasn't.`);

	const two = await browser.newPage(as(player('replays', 2)));
	await two.goto(url());
	await expect(replays(two).getByText(`${p1} wants to publish`, { exact: true })).toBeVisible();
	await expect(
		replays(two).getByText('The replays go public when you press Publish too.')
	).toBeVisible();

	// The first player takes it back: private for both again.
	await press(one, 'Take it back', 'Take back your Publish?', 'The replays stay private.');
	await expect(one.getByRole('status')).toHaveText('Replays are private.');
	for (const line of PRIVATE(p2)) await expect(replays(one).getByText(line)).toBeVisible();
	await two.reload();
	for (const line of PRIVATE(p1)) await expect(replays(two).getByText(line)).toBeVisible();

	// The other way round, then both.
	await publish(two, `Everyone can watch once ${p1} presses Publish too.`);
	await orgSees(`${p2} pressed Publish; ${p1} hasn't.`);
	await one.reload();
	await expect(replays(one).getByText(`${p2} wants to publish`, { exact: true })).toBeVisible();
	await publish(one, `${p2} has already pressed Publish, so everyone can watch right away.`);
	await expect(one.getByRole('status')).toHaveText('Replays are public.');
	await isPublic(true);
	await orgSees('Both players published.');
	await expect(badge(org, 'Public')).toBeVisible();
	const PUBLIC =
		'Anyone can watch these replays. Adding, replacing or deleting one makes them private again.';
	await two.reload();
	for (const page of [one, two]) {
		await expect(badge(page, 'Public')).toBeVisible();
		await expect(replays(page).getByText(PUBLIC)).toBeVisible();
		await expect(replays(page).getByRole('button', { name: 'Unpublish' })).toBeVisible();
	}

	// A visitor watches, but changes nothing and isn't told who pressed what.
	await visitor.goto(url());
	await expect(replays(visitor).getByRole('link', { name: 'Watch game 1' })).toBeVisible();
	await expect(replays(visitor).getByRole('button')).toHaveCount(0);
	await expect(badge(visitor, 'Public')).toHaveCount(0);
	await expect(replays(visitor).getByText(/publish/i)).toHaveCount(0);

	// A new file is not what the two agreed to publish: replacing game 1 takes it back.
	await upload(two, file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child']), 'Game 1');
	await expect(two.getByRole('status')).toHaveText(
		'Replay added for game 1. Replays are private again until you both publish.'
	);
	await expect(rows(two).first()).toContainText(`Added by ${p2}`);
	for (const line of PRIVATE(p1)) await expect(replays(two).getByText(line)).toBeVisible();
	await isPublic(false);

	// Either player can unpublish.
	await publish(two, `Everyone can watch once ${p1} presses Publish too.`);
	await one.reload();
	await publish(one, `${p2} has already pressed Publish`);
	await isPublic(true);
	await press(
		one,
		'Unpublish',
		'Unpublish these replays?',
		`They go back to private: only you, ${p2} and organizers can open them.`
	);
	await expect(one.getByRole('status')).toHaveText('Replays are private.');
	await isPublic(false);

	// The other player's Publish still stands, and deleting a replay takes it back too.
	await expect(replays(one).getByText(`${p2} wants to publish`, { exact: true })).toBeVisible();
	await one.getByLabel('More for game 1').click();
	await replays(one).getByRole('button', { name: 'Delete replay' }).click();
	const dialog = one.getByRole('dialog', { name: 'Delete the game 1 replay?' });
	await expect(dialog).toContainText(
		'The other replays go back to private until both players publish again.'
	);
	await dialog.getByRole('button', { name: 'Delete replay' }).click();
	await expect(one.getByRole('status')).toHaveText(
		'Game 1 replay deleted. Replays are private again.'
	);
});

test('Cancel, and the which-game step without JavaScript', async ({ browser }) => {
	seedReplay(match, 1);
	const other = file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child']);
	const page = await browser.newPage(as(player('replays', 1)));
	await page.goto(url());
	await opener(page).click();
	await page.getByRole('link', { name: 'Cancel' }).click();
	await expect(field(page)).toBeHidden();
	// Cancel on the which-game step drops the file and the notice, and saves nothing.
	await upload(page, other);
	await expect(which(page)).toBeVisible();
	await page.getByRole('link', { name: 'Cancel' }).click();
	await expect(page.getByRole('status')).toHaveCount(0);
	await expect(field(page)).toBeHidden();
	await opener(page).click();
	await expect(field(page)).toHaveValue('');
	await expect(which(page)).toHaveCount(0);
	await expect(rows(page).filter({ hasText: 'Added by' })).toHaveCount(1);

	// Without JavaScript the page comes back with an empty file field: it asks for both.
	const plain = await browser.newPage({ ...as(player('replays', 1)), javaScriptEnabled: false });
	await plain.goto(url());
	await upload(plain, other);
	await expect(plain.getByRole('status')).toContainText('Game 1 already has another replay.');
	await expect(field(plain)).toHaveValue('');
	await choose(plain, other);
	await which(plain).getByRole('radio', { name: 'Game 3' }).check();
	await plain.getByRole('button', { name: 'Save replay' }).click();
	await expect(plain.getByRole('status')).toContainText('Replay added for game 3.');
	await expect(rows(plain).filter({ hasText: 'Added by' })).toHaveCount(2);
});

test('the report form reminds players to save the replay', async ({ browser }) => {
	const page = await browser.newPage(as(player('replays', 1)));
	await page.goto(`/seasons/${slug}/matches/${open}`);
	const note = page.getByRole('note');
	await expect(note.getByText('Save your replays', { exact: true })).toBeVisible();
	await expect(note).toContainText(
		"RiftAtlas deletes replays after 6 hours. Download each game's replay there now. You can add them to the match once this result is saved."
	);
	await expect(replays(page)).toHaveCount(0);
});
