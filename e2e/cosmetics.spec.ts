import { expect, test } from '@playwright/test';
import { removeSeason, seedAchievements, seedSeason } from './db.ts';
import { PORT, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.cosmetics;
const me = player('cosmetics', 1);
const name = playerName('cosmetics', 1);

test.beforeAll(() => {
	seedSeason('cosmetics', { publishedRound: 3 });
	seedAchievements(me, ['first-blood', 'legend-ahri-bronze']);
});
test.afterAll(() => removeSeason('cosmetics'));

test('the owner equips a title, badge and frame, sees them on both pages, and clears one', async ({
	browser
}) => {
	const page = await browser.newPage(as(me));
	await page.goto(`/players/${me}`);
	await page.getByText('Customize profile', { exact: true }).click();
	const form = page.getByRole('form', { name: 'Customize your profile' });
	const pick = async (field: string, option: string) => {
		await form.getByRole('button', { name: new RegExp(`^${field} `) }).click();
		await form.getByRole('option', { name: option, exact: true }).click();
	};
	await pick('Title', 'Ahri Player');
	await pick('Badge', 'First Blood');
	// Frames are tiers: only bronze is on offer, since nothing silver or gold is earned.
	await form.getByRole('button', { name: /^Avatar frame / }).click();
	await expect(form.getByRole('option')).toHaveText([/None/, /Bronze/]);
	await form.getByRole('option', { name: 'Bronze' }).click();
	await expect(form.getByRole('img', { name: 'Bronze frame' }).first()).toBeVisible(); // live preview
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').first()).toContainText('Profile updated');

	for (const path of [`/players/${me}`, `/seasons/${slug}/players/${me}`]) {
		await page.goto(path);
		const head = page.getByRole('region', { name });
		await expect(head.getByText(/^Ahri Player · /)).toBeVisible();
		await expect(head.getByRole('img', { name: 'Bronze frame' })).toBeVisible();
		// The badge explains itself on focus or tap.
		await head.getByRole('button', { name: 'Badge: First Blood. Win your first match.' }).click();
		await expect(page.getByText('Win your first match.').last()).toBeVisible(); // the tooltip, on <body>
	}

	await page.goto(`/players/${me}`);
	await page.getByText('Customize profile', { exact: true }).click();
	await pick('Title', 'None');
	await form.getByRole('button', { name: 'Save' }).click();
	const head = page.getByRole('region', { name });
	await expect(head.getByText(/^Ahri Player · /)).toHaveCount(0);
	await expect(head.getByRole('button', { name: /^Badge: First Blood/ })).toBeVisible();
});

test('without JavaScript the pickers are plain grouped selects', async ({ browser }) => {
	const page = await browser.newPage({ ...as(me), javaScriptEnabled: false });
	await page.goto(`/players/${me}`);
	await page.getByText('Customize profile', { exact: true }).click();
	const form = page.getByRole('form', { name: 'Customize your profile' });
	await form.getByLabel('Avatar frame').selectOption({ label: 'Bronze' });
	await form.getByLabel('Title').selectOption({ label: 'First Blood' });
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').first()).toContainText('Profile updated');
	await expect(page.getByRole('region', { name }).getByText(/^First Blood · /)).toBeVisible();
});

test("another player can't customize someone else's profile", async ({ browser }) => {
	const page = await browser.newPage(as(player('cosmetics', 2)));
	await page.goto(`/players/${me}`);
	await expect(page.getByText('Customize profile')).toHaveCount(0);
	// A hand-made same-origin POST (the production build's CSRF check passes it).
	const res = await page.request.post(`/players/${me}?/customize`, {
		form: { title: 'champion', badge: '', frame: '' },
		headers: { origin: `http://localhost:${PORT}` }
	});
	expect(res.status()).toBe(403);
	await page.goto(`/players/${me}`);
	await expect(page.getByRole('region', { name }).getByText(/^Champion · /)).toHaveCount(0);
});
