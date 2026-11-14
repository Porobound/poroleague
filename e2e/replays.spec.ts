import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { replayFile } from '../src/lib/server/test/replayFile.ts';
import { publishReplays, removeSeason, seedReplay, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.replays;
let match: number; // round 1: Replays 1 vs Replays 2, reported 2–1, Ahri vs Annie
let open: number; // round 2: Replays 1 vs Replays 3, unreported
const url = () => `/seasons/${slug}/matches/${match}`;
const [p1, p2] = [playerName('replays', 1), playerName('replays', 2)];
// Player 1's or 2's file of a game.
const fileOf = (game: number, side = 1) => `${url()}/replay/${game}/${side}`;
// Dated now, after the season was seeded: an older game can't be this season's.
const file = (legends?: string[], replayId?: string) =>
	replayFile({ legends, replayId, completedAt: Date.now() });
const replays = (page: Page) => page.getByRole('region', { name: 'Replays' });
// The button that opens the upload form: "Add a replay" until the match has one.
const opener = (page: Page) => replays(page).getByText(/^Add (a|or replace your) replay$/);
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
// One entry per played game, holding its files; a pressed Watch adds its own list of steps.
const rows = (page: Page) =>
	replays(page)
		.getByRole('listitem')
		.filter({ hasText: /^Game \d/ });
// One entry per file, whichever game it is in.
const files = (page: Page) =>
	replays(page)
		.getByRole('listitem')
		.filter({ hasText: /replay\s*(One side|Both sides)/ })
		.filter({ hasNotText: /^Game \d/ });
// The header's badge; a player's publish box repeats the word after it.
const badge = (page: Page, text: 'Private' | 'Public') =>
	replays(page).getByText(text, { exact: true }).first();

let mixed: number; // round 3: Replays 1 vs Replays 4

test.beforeAll(() => {
	[match, , open, , mixed] = seedSeason('replays', { publishedRound: 3 });
	seedResult(match, 2, 1);
});
test.afterAll(() => removeSeason('replays'));

test('upload, watch, and who can see a replay', async ({ browser }) => {
	const game1 = file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child']);
	const uploader = await browser.newPage(as(player('replays', 1)));
	await uploader.goto(url());
	await expect(rows(uploader)).toHaveCount(0);
	await expect(
		replays(uploader).getByText(
			"No replays yet. They're optional: if you'd like to share a game, download your replay from RiftAtlas and add it here. Each player can add one file per game.",
			{ exact: true }
		)
	).toBeVisible();
	await expect(badge(uploader, 'Private')).toHaveCount(0);
	// The form opens on demand.
	await expect(opener(uploader)).toHaveText('Add a replay');
	await expect(field(uploader)).toBeHidden();

	// A file of other legends isn't this match: the form stays open, the field marked.
	await upload(uploader, file());
	// Nobody has published: the form says so quietly, without the public warning.
	await expect(
		replays(uploader).getByText('It stays private until you both publish.', { exact: true })
	).toBeVisible();
	await expect(replays(uploader).getByRole('note')).toHaveCount(0);
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
		'Replay added for game 1. It stays private until you both publish.'
	);
	await expect(field(uploader)).toBeHidden();
	await expect(opener(uploader)).toHaveText('Add or replace your replay');
	// Every played game has a row; the ones without a replay have nothing to press.
	await expect(rows(uploader)).toHaveText([
		/^Game 1\s*Your replay\s*Both sides\s*Shows both decks and hands · added \w{3} \d+ \w{3}/,
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
		replays(opponent)
			.getByRole('link', { name: `Watch ${p1}'s replay of game 1 on RiftAtlas` })
			.click()
	]);
	const name = `poroleague-${slug}-match-${match}-game-1-replays-1.json`;
	expect(download.suggestedFilename()).toBe(name);
	expect(popup.url()).toBe('https://play.riftatlas.com/?replayFile=1');
	// It travels gzipped; what lands on disk is the JSON.
	expect(readFileSync(await download.path(), 'utf8')).toBe(game1);
	const got = await opponent.request.get(fileOf(1));
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
		'You already have a replay for game 1. Choose which game this file is.'
	);
	// The file is kept; the form now asks only for the game.
	await expect(field(uploader)).toBeHidden();
	await expect(which(uploader).getByText('replay.json')).toBeVisible();
	await expect(which(uploader).getByRole('radio')).toHaveCount(3);
	await expect(
		which(uploader).getByRole('radio', {
			name: `Game 1 Replaces your replay. ${p2} hasn't added one.`
		})
	).toBeVisible();
	const save = uploader.getByRole('button', { name: 'Save replay' });
	await expect(save).toBeDisabled();
	await expect(files(uploader)).toHaveCount(1);
	await which(uploader).getByRole('radio', { name: 'Game 2 No replays yet.' }).check();
	await save.click();
	await expect(uploader.getByRole('status')).toHaveText(
		'Replay added for game 2. It stays private until you both publish.'
	);
	await expect(files(uploader)).toHaveCount(2);
	expect(await (await opponent.request.get(fileOf(1))).text()).toBe(game1);
	expect(await (await opponent.request.get(fileOf(2))).text()).toBe(room2);

	// The opponent's file of yet another game also says "game 1": the notice says the file in the
	// way is someone else's, and each game says what both players have added there.
	await opponent.goto(url());
	await upload(opponent, file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child'], 'ROOM3:1'));
	await expect(opponent.getByRole('status')).toHaveText(
		`Game 1 has ${p1}'s replay of another game. Choose which game this file is.`
	);
	for (const name of [
		`Game 1 You haven't added one. ${p1} has added theirs.`,
		`Game 2 You haven't added one. ${p1} has added theirs.`,
		'Game 3 No replays yet.'
	])
		await expect(which(opponent).getByRole('radio', { name })).toBeVisible();
	await opponent.getByRole('link', { name: 'Cancel' }).click();
	await expect(which(opponent)).toHaveCount(0);

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
		expect((await other.request.get(fileOf(1))).status()).toBe(404);
		await other.close();
	}

	// A player deletes through the row's menu.
	const own = replays(uploader).getByRole('button', { name: 'Delete your replay' });
	await expect(own).toBeHidden();
	await uploader.getByLabel('More for your replay of game 2').click();
	await own.click();
	// Nobody has pressed Publish, so deleting takes nothing back.
	await expect(uploader.getByRole('dialog', { name: 'Delete your replay of game 2?' })).toHaveText(
		/This can't be undone\.\s*Cancel/
	);
	await uploader.getByRole('dialog').getByRole('button', { name: 'Delete replay' }).click();
	await expect(uploader.getByRole('status')).toHaveText('Game 2 replay deleted.');
	await expect(rows(uploader).nth(1)).toHaveText(/No replay\s*$/);

	// An organizer sees it and can delete it straight from the row, but adds none.
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(url());
	await expect(opener(org)).toHaveCount(0);
	await expect(field(org)).toHaveCount(0);
	await expect(badge(org, 'Private')).toBeVisible();
	await expect(org.getByLabel(/^More for/)).toHaveCount(0);
	await replays(org)
		.getByRole('button', { name: `Delete ${p1}'s replay of game 1` })
		.click();
	await org
		.getByRole('dialog', { name: `Delete ${p1}'s replay of game 1?` })
		.getByRole('button', { name: 'Delete replay' })
		.click();
	await expect(org.getByRole('status')).toHaveText('Game 1 replay deleted.');
	await expect(replays(org).getByText('No replays yet.', { exact: true })).toBeVisible();
	await expect(badge(org, 'Private')).toHaveCount(0);
	await org.goto(`/seasons/${slug}/audit`);
	await expect(org.getByText('Game 2 replay uploaded')).toBeVisible();
	expect((await opponent.request.get(fileOf(1))).status()).toBe(404);
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
		press(
			page,
			'Publish',
			'Publish these replays?',
			'Replays show decks and hands. Publishing covers every replay of this match, including ones added later.',
			`${says} Either of you can take it back.`
		);
	const visitor = await browser.newPage();
	const chip = visitor.getByText('Replay available');
	const isPublic = async (yes: boolean) => {
		await visitor.goto(url());
		await expect(replays(visitor)).toHaveCount(yes ? 1 : 0);
		expect((await visitor.request.get(fileOf(1))).status()).toBe(yes ? 200 : 404);
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
		`Replays show decks and hands. Agree with ${them} before you publish.`
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
	await orgSees('Both players pressed Publish.');
	await expect(badge(org, 'Public')).toBeVisible();
	const PUBLIC = 'Anyone can watch these replays. A replay added later is public at once.';
	await two.reload();
	for (const page of [one, two]) {
		await expect(badge(page, 'Public')).toBeVisible();
		await expect(replays(page).getByText(PUBLIC)).toBeVisible();
		await expect(replays(page).getByRole('button', { name: 'Unpublish' })).toBeVisible();
	}

	// A visitor watches, but changes nothing and isn't told who pressed what.
	await visitor.goto(url());
	await expect(
		replays(visitor).getByRole('link', { name: `Watch ${p1}'s replay of game 1` })
	).toBeVisible();
	await expect(replays(visitor).getByRole('button')).toHaveCount(0);
	await expect(badge(visitor, 'Public')).toHaveCount(0);
	await expect(replays(visitor).getByText(/publish/i)).toHaveCount(0);

	// The other player adds their own file of game 1: it goes next to the first, public at once.
	// Their file isn't the same RiftAtlas game as the seeded one, so they say which game it is.
	// The form warns before they send it.
	const theirs = file(['Ahri, Nine-Tailed Fox', 'Annie, Dark Child']);
	await opener(two).click();
	await expect(replays(two).getByRole('note')).toHaveText(
		"This match's replays are public. A file you add is public at once, and it shows your deck and hand."
	);
	await expect(replays(two).getByText('It stays private until you both publish.')).toHaveCount(0);
	await upload(two, theirs, 'Game 1');
	await expect(two.getByRole('status')).toHaveText('Replay added for game 1. It is public.');
	// No new Publish: a visitor watches it straight away.
	await visitor.goto(url());
	await expect(files(visitor)).toHaveCount(2);
	await one.reload();
	for (const page of [one, two])
		await expect(rows(page)).toHaveText([
			/^Game 1\s*\S.*replay\s*Both sides.*replay\s*Both sides/,
			/^Game 2\s*No replay/,
			/^Game 3\s*No replay/
		]);
	await expect(files(one)).toHaveText([/^Your replay/, new RegExp(`^${p2}'s replay`)]);
	await expect(files(two)).toHaveText([new RegExp(`^${p1}'s replay`), /^Your replay/]);
	expect(await (await visitor.request.get(fileOf(1, 2))).text()).toBe(theirs);
	// A player has a menu, and so a Delete, on their own row only.
	await expect(files(one).first().getByLabel('More for your replay of game 1')).toBeVisible();
	await expect(files(one).nth(1).getByRole('button')).toHaveCount(0);
	await expect(files(two).first().getByRole('button')).toHaveCount(0);
	await expect(files(two).nth(1).getByLabel('More for your replay of game 1')).toBeVisible();

	// Either player can unpublish.
	await press(
		one,
		'Unpublish',
		'Unpublish these replays?',
		`They go back to private: only you, ${p2} and organizers can open them.`
	);
	await expect(one.getByRole('status')).toHaveText('Replays are private.');
	await isPublic(false);

	// The other player's Publish still stands, and deleting a file keeps it while one is left.
	await expect(replays(one).getByText(`${p2} wants to publish`, { exact: true })).toBeVisible();
	const remove = async (page: Page) => {
		await page.getByLabel('More for your replay of game 1').click();
		await replays(page).getByRole('button', { name: 'Delete your replay' }).click();
		const dialog = page.getByRole('dialog', { name: 'Delete your replay of game 1?' });
		await expect(dialog).toHaveText(/This can't be undone\.\s*Cancel/);
		await dialog.getByRole('button', { name: 'Delete replay' }).click();
		await expect(page.getByRole('status')).toHaveText('Game 1 replay deleted.');
	};
	await remove(one);
	await expect(replays(one).getByText(`${p2} wants to publish`, { exact: true })).toBeVisible();
	await expect(files(one)).toHaveText([new RegExp(`^${p2}'s replay`)]);
	await expect(one.getByLabel(/^More for/)).toHaveCount(0);
	await two.reload();
	await remove(two);
	await expect(replays(two).getByText('No replays yet.', { exact: false })).toBeVisible();
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
	await expect(files(page)).toHaveCount(1);

	// Without JavaScript the page comes back with an empty file field: it asks for both.
	const plain = await browser.newPage({ ...as(player('replays', 1)), javaScriptEnabled: false });
	await plain.goto(url());
	await upload(plain, other);
	await expect(plain.getByRole('status')).toContainText('You already have a replay for game 1.');
	await expect(field(plain)).toHaveValue('');
	await choose(plain, other);
	await which(plain).getByRole('radio', { name: 'Game 3' }).check();
	await plain.getByRole('button', { name: 'Save replay' }).click();
	await expect(plain.getByRole('status')).toContainText('Replay added for game 3.');
	await expect(files(plain)).toHaveCount(2);
});

test('the report form reminds players to save the replay', async ({ browser }) => {
	const page = await browser.newPage(as(player('replays', 1)));
	await page.goto(`/seasons/${slug}/matches/${open}`);
	const note = page.getByRole('note');
	await expect(note.getByText('Replays are optional', { exact: true })).toBeVisible();
	await expect(note).toContainText(
		"If you'd like to share this match, download your replays from RiftAtlas soon: a free account keeps them for 6 hours, a subscription for longer. You can add them once this result is saved."
	);
	await expect(replays(page)).toHaveCount(0);
});

// Last: the match goes public, which would add a marker to the schedule the tests above count.
test('each game lists its files and the sides they show', async ({ browser }) => {
	const [a, d] = [p1, playerName('replays', 4)];
	seedResult(mixed, 2, 1, { games: '1D21' });
	seedReplay(mixed, 1, { side: 1, bothSides: false });
	seedReplay(mixed, 1, { side: 2, bothSides: false });
	seedReplay(mixed, 2, { side: 2, bothSides: false });
	seedReplay(mixed, 3, { side: 1 });
	const path = `/seasons/${slug}/matches/${mixed}`;
	const invite = /Your side is hidden in this replay/;
	const note = /side stays hidden unless they add their replay of this game\./;
	const visit = async (who?: string) => {
		const page = await browser.newPage(who ? as(who) : {});
		await page.goto(path);
		return page;
	};

	const one = await visit(player('replays', 1));
	await expect(rows(one)).toHaveText([
		/^Game 1\s*Each side in its own replay\s*Your replay/,
		/^Game 2\s*\S.*'s replay/,
		/^Game 3\s*Your replay/,
		/^Game 4\s*No replay\s*$/
	]);
	await expect(files(one)).toHaveText([
		/^Your replay\s*One side\s*Shows your deck and hand only · added /,
		new RegExp(`^${d}'s replay\\s*One side\\s*Shows ${d}'s deck and hand only · added `),
		new RegExp(`^${d}'s replay\\s*One side`),
		/^Your replay\s*Both sides\s*Shows both decks and hands · added /
	]);
	// Only game 2 hides this player's side; game 3's file shows both.
	await expect(rows(one).nth(1)).toContainText(
		"Your side is hidden in this replay. If you'd like to show it, add your replay of game 2."
	);
	await expect(replays(one).getByText(invite)).toHaveCount(1);
	await expect(replays(one).getByText(note)).toHaveCount(0);
	await expect(one.getByLabel(/^More for your replay/)).toHaveCount(2);
	// "Add yours" opens the upload form, ready for the file.
	await expect(field(one)).toBeHidden();
	await rows(one).nth(1).getByRole('button', { name: 'Add yours' }).click();
	await expect(field(one)).toBeFocused();
	await expect(which(one)).toHaveCount(0);

	const four = await visit(player('replays', 4));
	await expect(rows(four).nth(1)).toContainText(
		`${a}'s side stays hidden unless they add their replay of this game.`
	);
	await expect(replays(four).getByText(note)).toHaveCount(1);
	await expect(replays(four).getByText(invite)).toHaveCount(0);
	await expect(files(four)).toHaveText([
		new RegExp(`^${a}'s replay\\s*One side\\s*Shows ${a}'s deck and hand only`),
		/^Your replay\s*One side\s*Shows your deck and hand only/,
		/^Your replay\s*One side/,
		new RegExp(`^${a}'s replay\\s*Both sides`)
	]);
	await expect(four.getByLabel(/^More for your replay/)).toHaveCount(2);

	publishReplays(mixed);
	const visitor = await visit();
	await expect(files(visitor)).toHaveCount(4);
	await expect(rows(visitor).first()).toContainText('Each side in its own replay');
	await expect(replays(visitor).getByText(invite)).toHaveCount(0);
	await expect(replays(visitor).getByText(note)).toHaveCount(0);
	await expect(replays(visitor).getByRole('button')).toHaveCount(0);

	// An organizer is told who added what, and deletes any file.
	const org = await visit(ORGANIZER);
	await expect(
		replays(org).getByText(`${a} added games 1, 3. ${d} added games 1, 2.`, { exact: true })
	).toBeVisible();
	await expect(replays(org).getByText(invite)).toHaveCount(0);
	await expect(replays(org).getByText(note)).toHaveCount(0);
	await expect(replays(org).getByRole('button', { name: /^Delete / })).toHaveCount(4);
	await replays(org)
		.getByRole('button', { name: `Delete ${d}'s replay of game 2` })
		.click();
	const dialog = org.getByRole('dialog', { name: `Delete ${d}'s replay of game 2?` });
	await expect(dialog).toContainText("This can't be undone. The other replays stay public.");
	await dialog.getByRole('button', { name: 'Cancel' }).click();
});
