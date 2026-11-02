import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { PORT, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.cosmetics;
const me = player('cosmetics', 1);
const name = playerName('cosmetics', 1);
let third: number; // round 3: Cosmetics 1 vs Cosmetics 4

// Two Ahri matches already in (seeded, so nothing awarded yet): a 2–0 win and a 0–2 loss.
test.beforeAll(() => {
	const ids = seedSeason('cosmetics', { publishedRound: 3 });
	seedResult(ids[0], 2, 0);
	seedResult(ids[2], 0, 2);
	third = ids[4];
});
test.afterAll(() => removeSeason('cosmetics'));

test('earn, equip, show; badge only in standings; clear a slot', async ({ browser }) => {
	const page = await browser.newPage(as(me));
	// The third Ahri match earns Ahri Player (bronze); the earlier win earns First Blood.
	await page.goto(`/seasons/${slug}/matches/${third}`);
	await page.getByLabel('Legend').nth(0).selectOption('Ahri');
	await page.getByLabel('Legend').nth(1).selectOption('Annie');
	await page.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel(name).check();
	for (const g of [1, 2])
		await page
			.getByRole('radiogroup', { name: new RegExp(`^Game ${g}`) })
			.getByLabel(name)
			.check();
	await page.getByRole('button', { name: 'Add result' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(page.getByRole('status').first()).toContainText('Result saved');

	await page.goto(`/players/${me}`);
	await page.getByText('Customize profile', { exact: true }).click();
	const form = page.getByRole('form', { name: 'Customize your profile' });
	await form.getByLabel('Title').selectOption({ label: 'Ahri Player' });
	await form.getByLabel('Badge').selectOption({ label: 'First Blood' });
	await form.getByLabel('Avatar frame').selectOption({ label: 'Bronze · Ahri Player' });
	await expect(form.getByRole('img', { name: 'Bronze frame' })).toBeVisible(); // live preview
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').first()).toContainText('Profile updated');

	for (const path of [`/players/${me}`, `/seasons/${slug}/players/${me}`]) {
		await page.goto(path);
		const head = page.getByRole('region', { name });
		await expect(head.getByText('Ahri Player', { exact: true })).toBeVisible();
		await expect(head.getByRole('img', { name: 'First Blood badge' })).toBeVisible();
		await expect(head.getByRole('img', { name: 'Bronze frame' })).toBeVisible();
	}

	await page.goto(`/seasons/${slug}`);
	const row = page.getByRole('row').filter({ hasText: name });
	await expect(row.getByRole('img', { name: 'First Blood badge' })).toBeVisible();
	await expect(row.getByText('Ahri Player')).toHaveCount(0);
	await expect(row.getByRole('img', { name: 'Bronze frame' })).toHaveCount(0);
	await page.goto(`/seasons/${slug}/schedule`);
	await expect(page.getByRole('img', { name: 'First Blood badge' })).toHaveCount(0);

	await page.goto(`/players/${me}`);
	await page.getByText('Customize profile', { exact: true }).click();
	await form.getByLabel('Title').selectOption({ label: 'None' });
	await form.getByRole('button', { name: 'Save' }).click();
	const head = page.getByRole('region', { name });
	await expect(head.getByText('Ahri Player', { exact: true })).toHaveCount(0);
	await expect(head.getByRole('img', { name: 'First Blood badge' })).toBeVisible();
});

test("another player can't customize someone else's profile", async ({ browser }) => {
	const page = await browser.newPage(as(player('cosmetics', 2)));
	await page.goto(`/players/${me}`);
	await expect(page.getByText('Customize profile')).toHaveCount(0);
	// A hand-made same-origin POST (the production build's CSRF check passes it).
	const res = await page.request.post(`/players/${me}?/customize`, {
		form: { title: 'first-blood', badge: '', frame: '' },
		headers: { origin: `http://localhost:${PORT}` }
	});
	expect(res.status()).toBe(403);
	await page.goto(`/players/${me}`);
	await expect(
		page.getByRole('region', { name }).getByText('First Blood', { exact: true })
	).toHaveCount(0);
});
