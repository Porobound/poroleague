import { expect, test } from '@playwright/test';
import { removeSeason, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName, posts } from './fixtures.ts';

const slug = SEASONS.report;
let match: number; // round 1: Report 1 vs Report 2
const [p1, p2] = [playerName('report', 1), playerName('report', 2)];
const titles = async (channel: 'results' | 'organizers') =>
	(await posts(channel)).flatMap(
		(b) => b.embeds?.map((e) => `${e.title} | ${e.description}`) ?? []
	);
// The reporter's card, their side first: names, legends and games won.
const card = (a: number, b: number) =>
	new RegExp(`${p1}\\nAhri\\n${a}\\n.*${p2}\\nAnnie\\n${b}`, 's');

test.beforeAll(() => {
	[match] = seedSeason('report', { publishedRound: 3 });
});
test.afterAll(() => removeSeason('report'));

test('report, flag, organizer fix', async ({ browser }) => {
	// The player reports 2–1 through the real form.
	const reporter = await browser.newPage(as(player('report', 1)));
	await reporter.goto(`/seasons/${slug}/matches/${match}`);
	const games = reporter.getByRole('group', { name: 'Games won' });
	const add = reporter.getByRole('button', { name: 'Add result' });
	await expect(add).toBeDisabled();
	await games.nth(0).getByLabel('2').check();
	await games.nth(1).getByLabel('2').check();
	await reporter.getByLabel('Legend').nth(0).selectOption('Ahri');
	await reporter.getByLabel('Legend').nth(1).selectOption('Annie');
	await reporter.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel(p2).check();
	await expect(add).toBeDisabled(); // 2–2 isn't a Bo3 score
	await games.nth(1).getByLabel('1').check();
	await add.click();
	await reporter.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(reporter.getByRole('status')).toContainText('Result saved');
	await expect(reporter.getByRole('article')).toHaveText(card(2, 1), { useInnerText: true });
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
	await edit.getByLabel(`${p1} games`).selectOption('1');
	await edit.getByLabel(`${p2} games`).selectOption('2');
	await edit.getByRole('button', { name: 'Save result' }).click();
	await expect(organizer.getByRole('status')).toContainText('Result changed. Flag resolved.');
	await expect(flags).toHaveCount(0);
	await expect
		.poll(() => titles('organizers'))
		.toContain(`Flag resolved by Org | New result: ${p1} 1–2 ${p2} (Ahri vs Annie)`);

	// Players see the fixed result as final.
	await reporter.reload();
	await expect(reporter.getByText('Flag resolved by an organizer · final')).toBeVisible();
	await expect(reporter.getByRole('article')).toHaveText(card(1, 2), { useInnerText: true });

	// Every change is in the public audit log, newest first.
	await reporter.goto(`/seasons/${slug}/audit`);
	await expect(reporter.getByRole('rowgroup').nth(1).getByRole('row')).toHaveText([
		/Org\s*Edit/,
		new RegExp(`${p2}\\s*Flag.*It was 1-2, not 2-1.`),
		new RegExp(`${p1}\\s*Report`)
	]);
});
