import { expect, test, type Page } from '@playwright/test';
import { removeSeason, seedEntries, seedPlayers } from './db.ts';
import { ORGANIZER, SEASONS, as, player, playerName, posts } from './fixtures.ts';

const slug = SEASONS.setup;
const name = 'E2E Setup';
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
// Two groups need 17 players: three use the site, the other 15 are signed up directly.
const PLAYERS = 18;

test.beforeAll(() => seedPlayers('setup', PLAYERS));
test.afterAll(() => removeSeason('setup'));

const confirm = async (page: Page, button: string, confirmLabel: string) => {
	await page.getByRole('button', { name: button }).click();
	await page.getByRole('dialog').getByRole('button', { name: confirmLabel }).click();
};

test('season setup to first publish', async ({ browser }) => {
	// The organizer creates the season and opens signup.
	const organizer = await browser.newPage(as(ORGANIZER));
	await organizer.goto('/admin');
	await organizer.getByLabel('Season name').fill(name);
	await organizer.getByLabel('Slug').fill(slug);
	await organizer.getByLabel('Start date').fill(day(0));
	await organizer.getByLabel('Season deadline').fill(day(60));
	await organizer.getByRole('button', { name: 'Create season' }).click();
	await expect(organizer).toHaveURL(`/seasons/${slug}/admin/season`);
	await confirm(organizer, 'Open signup', 'Open signup');
	await expect(organizer.getByRole('status')).toContainText('Signup is open.');

	// Three players join on the season page; the third withdraws.
	seedEntries('setup', 4, PLAYERS);
	for (const n of [1, 2, 3]) {
		const p = await browser.newPage(as(player('setup', n)));
		await p.goto(`/seasons/${slug}`);
		await p.getByRole('button', { name: `Sign up for ${name}` }).click();
		await expect(p.getByRole('status')).toContainText("You're in.");
		if (n === 3) {
			await confirm(p, 'Withdraw', 'Withdraw');
			await expect(p.getByRole('status')).toContainText(`You withdrew from ${name}.`);
			await expect(p.getByRole('button', { name: `Sign up for ${name}` })).toBeVisible();
		}
		await p.close();
	}
	// The signup panel shows 12 avatars and a count; no full roster.
	await organizer.goto(`/seasons/${slug}`);
	await expect(organizer.getByText('+5 more')).toBeVisible();
	await expect(organizer.getByRole('heading', { name: 'Players' })).toHaveCount(0);
	const playerHref = (n: number) => `/seasons/${slug}/players/${player('setup', n)}`;
	await organizer.goto(`/seasons/${slug}/admin/players`);
	await expect(
		organizer.getByRole('link', { name: playerName('setup', 1), exact: true })
	).toHaveAttribute('href', playerHref(1));

	// Closing signup draws groups of nine and eight; the organizer moves Setup 1 to the other group.
	await organizer.goto(`/seasons/${slug}/admin/season`);
	await confirm(organizer, 'Close signup & draw groups', 'Close signup');
	await expect(organizer).toHaveURL(`/seasons/${slug}/admin/groups`);
	await expect(organizer.getByRole('heading', { name: 'Group draw preview' })).toBeVisible();
	const row = (n: number) =>
		organizer
			.getByRole('listitem')
			.filter({ has: organizer.getByText(playerName('setup', n), { exact: true }) });
	await expect(organizer.getByRole('listitem')).toHaveCount(17);
	await expect(row(3)).toHaveCount(0);
	const move = row(1).getByRole('button', { name: /^Move to [AB]$/ });
	const to = (await move.textContent())!.trim().slice(-1);
	await move.click();
	await expect(row(1).getByRole('button')).toHaveText(`Move to ${to === 'A' ? 'B' : 'A'}`);
	await expect(row(1).getByRole('link', { name: playerName('setup', 1) })).toHaveAttribute(
		'href',
		playerHref(1)
	);

	// The groups need 9 rounds, 5 weeks at 2 a week, so a deadline in two weeks is refused.
	await organizer.goto(`/seasons/${slug}/admin/season`);
	await organizer.getByLabel('Season deadline').fill(day(14));
	await confirm(organizer, 'Save changes', 'Save changes');
	await expect(organizer.getByText(/The last round's week ends/)).toBeVisible();
	await organizer.goto(`/seasons/${slug}/admin/groups`);

	// Lock, then publish week 1 from the overview.
	await confirm(organizer, 'Lock groups & generate schedule', 'Lock groups');
	const locked = organizer.getByRole('status');
	await expect(locked).toHaveText('Groups locked. Publish week 1 from the overview.');
	// One line of text: the link sits inline, not as its own flex item.
	const [box, link] = await Promise.all([
		locked.boundingBox(),
		locked.getByRole('link', { name: 'overview' }).boundingBox()
	]);
	expect(link!.height * 2).toBeGreaterThan(box!.height - 24);
	await organizer.goto(`/seasons/${slug}/admin`);
	await confirm(organizer, 'Publish week 1', 'Publish');
	await expect(organizer.getByRole('status')).toContainText(
		'Week 1 published and posted in Discord.'
	);

	// The pairings post names the week and has Setup 1 in the group it was moved to.
	await expect
		.poll(async () => (await posts('pairings')).map((b) => b.content))
		.toContainEqual(expect.stringContaining(`**${name} · Week 1**`));
	const post = (await posts('pairings')).find((b) => b.content?.includes(name))!;
	expect(post.embeds!.map((e) => e.title)).toEqual(['Round 1', 'Round 2']);
	const groups = post.embeds!.flatMap((e) => e.fields ?? []);
	// 17 players always leave one group odd, so a week can hold a bye: at least one match, all in Group <to>.
	const mine = groups.filter((f) =>
		f.value.split('\n').some((l) => l.split(' vs ').includes(playerName('setup', 1)))
	);
	expect(mine.length).toBeGreaterThan(0);
	expect(mine.map((f) => f.name)).toEqual(mine.map(() => `Group ${to}`));

	// The cut is per group.
	await organizer.goto(`/seasons/${slug}`);
	await expect(organizer.getByText('Top 4 of each group go to the top cut.')).toBeVisible();
});
