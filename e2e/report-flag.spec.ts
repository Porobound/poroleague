import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName, posts } from './fixtures.ts';

const slug = SEASONS.report;
let match: number; // round 1: Report 1 vs Report 2
const [p1, p2] = [playerName('report', 1), playerName('report', 2)];
const titles = async (channel: 'results' | 'organizers') =>
	(await posts(channel)).flatMap(
		(b) => b.embeds?.map((e) => `${e.title} | ${e.description}`) ?? []
	);
// The reporter's card, their side first: names, legends and games won, then who won each game.
const card = (a: number, b: number) =>
	new RegExp(`${p1}\\nAhri\\n${a}\\n.*${p2}\\nAnnie\\n${b}\\nGames\\n`, 'si');
// Each chip's title names the game and its winner.
const chips = (page: Page) => page.getByRole('list', { name: 'Games' }).getByRole('listitem');
const game = (page: Page, n: number) =>
	page.getByRole('radiogroup', { name: new RegExp(`^Game ${n}`) });

test.beforeAll(() => {
	[match] = seedSeason('report', { publishedRound: 3 });
});
test.afterAll(() => removeSeason('report'));

test('report, flag, organizer fix', async ({ browser }) => {
	// The player reports 2–1 through the real form.
	const reporter = await browser.newPage(as(player('report', 1)));
	await reporter.goto(`/seasons/${slug}/matches/${match}`);
	const add = reporter.getByRole('button', { name: 'Add result' });
	await expect(add).toBeDisabled();
	// p1 · Draw · p2 sit on one row, apart.
	const boxes = await Promise.all(
		[p1, 'Draw', p2].map(
			async (n) => (await game(reporter, 1).getByText(n, { exact: true }).boundingBox())!
		)
	);
	expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
	expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
	await reporter.getByLabel('Legend').nth(0).selectOption('Ahri');
	await reporter.getByLabel('Legend').nth(1).selectOption('Annie');
	await reporter.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel(p2).check();
	await game(reporter, 1).getByLabel(p1).check();
	await game(reporter, 2).getByLabel(p1).check();
	await game(reporter, 3).getByLabel(p2).check();
	await expect(reporter.getByRole('alert')).toHaveText(
		"Game 3 can't be played: the match was already 2–0."
	);
	await expect(add).toBeDisabled();
	await game(reporter, 2).getByLabel(p2).check();
	await game(reporter, 3).getByLabel(p1).check();
	await expect(reporter.getByText(`Result: ${p1} 2–1 ${p2}`)).toBeVisible();
	await add.click();
	await reporter.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(reporter.getByRole('status')).toContainText('Result saved');
	await expect(reporter.getByRole('article')).toHaveText(card(2, 1), { useInnerText: true });
	for (const [i, who] of [p1, p2, p1].entries())
		await expect(chips(reporter).nth(i)).toHaveAttribute('title', `Game ${i + 1}: ${who} won`);
	await expect(reporter.getByText('Reported by you')).toBeVisible();
	await expect
		.poll(() => titles('results'))
		.toContain(`${p1} 2–1 ${p2} | Ahri vs Annie · 🎲 ${p2} won the roll`);

	// The opponent flags it.
	const opponent = await browser.newPage(as(player('report', 2)));
	await opponent.goto(`/seasons/${slug}/matches/${match}`);
	await opponent.getByRole('button', { name: 'Flag this result' }).click();
	const flag = opponent.getByRole('dialog');
	await flag.getByLabel("What's wrong?").fill('It was 1-2, not 2-1.');
	await flag.getByRole('button', { name: 'Flag result' }).click();
	await expect(opponent.getByRole('status')).toContainText('Flagged. An organizer will check it.');
	await expect(opponent.getByText('You flagged this result.')).toBeVisible();
	await expect
		.poll(() => titles('organizers'))
		.toContain(`Result flagged by ${p2} | ${p1} 2–1 ${p2} (Ahri vs Annie)`);

	// The organizer sees the flag on the season admin page and changes the result.
	const organizer = await browser.newPage(as(ORGANIZER));
	await organizer.goto(`/seasons/${slug}/admin`);
	const flags = organizer.getByRole('region', { name: /Flagged results/ });
	await expect(flags).toContainText('It was 1-2, not 2-1.');
	await flags.getByRole('button', { name: 'Edit result' }).click();
	const edit = organizer.getByRole('dialog', { name: 'Change this result?' });
	// The dialog covers the card, so it repeats the flag and its reason.
	await expect(edit.getByRole('figure')).toHaveText(
		new RegExp(`Flagged by ${p2}\\s*It was 1-2, not 2-1.`, 'i')
	);
	// It opens with the reported games filled in.
	await expect(game(organizer, 3).getByLabel(p1)).toBeChecked();
	await game(organizer, 1).getByLabel(p2).check();
	await game(organizer, 2).getByLabel(p1).check();
	await game(organizer, 3).getByLabel(p2).check();
	await edit.getByRole('button', { name: 'Save result' }).click();
	await expect(organizer.getByRole('status')).toContainText('Result changed. Flag resolved.');
	await expect(flags).toHaveCount(0);
	await expect
		.poll(() => titles('organizers'))
		.toContain(`Flag resolved by Org | New result: ${p1} 1–2 ${p2} (Ahri vs Annie)`);

	// The admin match list marks it resolved, and the Resolved filter shows only it.
	await organizer.goto(`/seasons/${slug}/admin/matches`);
	await organizer.getByRole('link', { name: 'Resolved' }).click();
	const resolvedRows = organizer.getByRole('rowgroup').nth(1).getByRole('row');
	await expect(resolvedRows).toHaveCount(1);
	await expect(resolvedRows).toContainText(new RegExp(`${p1}\\s*vs\\s*${p2}`));
	await expect(resolvedRows.getByText('Resolved', { exact: true })).toBeVisible();

	// Players see the fixed result as final.
	await reporter.reload();
	await expect(reporter.getByText('Flag resolved by an organizer · final')).toBeVisible();
	await expect(reporter.getByRole('article')).toHaveText(card(1, 2), { useInnerText: true });
	await expect(chips(reporter)).toHaveCount(3);
	await expect(chips(reporter).first()).toHaveAttribute('title', `Game 1: ${p2} won`);

	// Match lists mark the resolved flag on that match only.
	await reporter.goto(`/seasons/${slug}/schedule`);
	await expect(reporter.getByRole('img', { name: 'Flag resolved by an organizer' })).toHaveCount(1);

	// Every change is in the public audit log, newest first.
	await reporter.goto(`/seasons/${slug}/audit`);
	await expect(reporter.getByRole('rowgroup').nth(1).getByRole('row')).toHaveText([
		/Org\s*Edit/,
		new RegExp(`${p2}\\s*Flag.*It was 1-2, not 2-1.`),
		new RegExp(`${p1}\\s*Report`)
	]);
});
