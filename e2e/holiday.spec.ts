// Holiday mode: a player asks, an organizer decides, the early match is played and stays hidden
// from everyone else until its week is published.
import { expect, test } from '@playwright/test';
import { removeSeason, seedHoliday, seedSeason } from './db.ts';
import { ORGANIZER, PORT, SEASONS, as, player, posts } from './fixtures.ts';

const slug = SEASONS.holiday;
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let early: number; // round 3: Holiday 1 vs Holiday 4
let other: number; // round 3: Holiday 2 vs Holiday 3

// Two rounds a week: week 1 (rounds 1–2) is published, week 2 (round 3) runs day 4 to day 10.
test.beforeAll(() => {
	const ids = seedSeason('holiday', { publishedRound: 2, startDate: day(-3), deadline: day(20) });
	[early, other] = [ids[4], ids[5]];
});
test.afterAll(() => removeSeason('holiday'));
// The flow publishes week 2 at its end, so the reject/revoke checks run first.
test.describe.configure({ mode: 'serial' });

test('reject with a reason only the player sees; cancel; revoke keeps the match', async ({
	browser
}) => {
	const [h2, h3] = [player('holiday', 2), player('holiday', 3)];
	seedHoliday('holiday', 2, day(5), day(6));
	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/admin/season`);
	await org
		.getByRole('row', { name: /Holiday 2/ })
		.getByRole('button', { name: 'Reject' })
		.click();
	const dlg = org.getByRole('dialog', { name: 'Reject Holiday 2’s holiday?' });
	await dlg.getByLabel('Reason (optional)').fill('Ask a week ahead.');
	await dlg.getByRole('button', { name: 'Reject' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday rejected for Holiday 2');

	const p2 = await browser.newPage(as(h2));
	await p2.goto(`/seasons/${slug}/players/${h2}`);
	await expect(p2.getByRole('heading', { name: 'Holiday not approved' })).toBeVisible();
	await expect(p2.getByText('“Ask a week ahead.”')).toBeVisible();
	const p3 = await browser.newPage(as(h3));
	await p3.goto(`/seasons/${slug}/players/${h2}`);
	await expect(p3.getByText('Ask a week ahead.')).toHaveCount(0);
	await p3.goto(`/seasons/${slug}/audit`);
	await expect(p3.getByText(/Holiday 2 — holiday .* rejected/)).toBeVisible();
	await expect(p3.getByText('Ask a week ahead.')).toHaveCount(0);

	// Holiday 3 asks, then cancels: the card goes, nothing is logged.
	await p3.goto(`/seasons/${slug}/players/${h3}`);
	await p3.getByRole('button', { name: 'Going away?' }).click();
	const ask = p3.getByRole('dialog', { name: 'Going away?' });
	await ask.getByLabel('First day away').fill(day(5));
	await ask.getByLabel('Last day away').fill(day(6));
	await ask.getByRole('button', { name: 'Request holiday' }).click();
	await expect(p3.getByRole('heading', { name: 'Holiday requested' })).toBeVisible();
	await p3.getByRole('button', { name: 'Cancel request' }).click();
	await p3.getByRole('dialog').getByRole('button', { name: 'Cancel request' }).click();
	await expect(p3.getByRole('status')).toHaveText('Request cancelled.');
	await expect(p3.getByRole('heading', { name: 'Holiday requested' })).toHaveCount(0);

	// Approved, then revoked: the badge goes, the round 3 match (Holiday 2 vs Holiday 3) still opens.
	seedHoliday('holiday', 3, day(5), day(6), 'approved');
	expect((await p3.goto(`/seasons/${slug}/matches/${other}`))?.status()).toBe(200);
	await org.reload();
	await org
		.getByRole('row', { name: /Holiday 3/ })
		.getByRole('button', { name: 'Revoke' })
		.click();
	await org.getByRole('dialog').getByRole('button', { name: 'Revoke holiday' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday revoked for Holiday 3');
	await p3.goto(`/seasons/${slug}/players/${h3}`);
	await expect(p3.getByRole('heading', { name: 'Holiday revoked' })).toBeVisible();
	// The still-unlocked match says why: a Holiday revoked tag instead of On holiday.
	const early = p3.getByRole('region', { name: 'Unlocked early' });
	await expect(early.getByText('Holiday revoked')).toBeVisible();
	await expect(early.getByText('On holiday')).toHaveCount(0);
	expect((await p3.goto(`/seasons/${slug}/matches/${other}`))?.status()).toBe(200);
	// The match card's name tags show where the page has no report form: the organizer's view.
	await org.goto(`/seasons/${slug}/matches/${other}`);
	await expect(org.getByText('Holiday revoked')).toBeVisible();
	await expect(org.getByText('On holiday')).toHaveCount(0);
});

test('request → approve → early report stays hidden → publish posts it', async ({ browser }) => {
	const p1 = await browser.newPage(as(player('holiday', 1)));
	await p1.goto(`/seasons/${slug}/players/${player('holiday', 1)}`);
	await p1.getByRole('button', { name: 'Going away?' }).click();
	const ask = p1.getByRole('dialog', { name: 'Going away?' });
	await ask.getByLabel('First day away').fill(day(5));
	await ask.getByLabel('Last day away').fill(day(7));
	await expect(ask.getByText('Covers week 2 (round 3).')).toBeVisible();
	await ask.getByRole('button', { name: 'Request holiday' }).click();
	await expect(p1.getByRole('status')).toContainText('Holiday requested');
	await expect(p1.getByRole('heading', { name: 'Holiday requested' })).toBeVisible();
	await expect
		.poll(async () =>
			(await posts('organizers')).some((b) => b.embeds?.[0].title === 'Holiday request: Holiday 1')
		)
		.toBe(true);

	const org = await browser.newPage(as(ORGANIZER));
	await org.goto(`/seasons/${slug}/admin/season`);
	await org
		.getByRole('row', { name: /Holiday 1/ })
		.getByRole('button', { name: 'Approve' })
		.click();
	await org.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
	await expect(org.getByRole('status')).toContainText('Holiday approved for Holiday 1');

	// Both players see the round 3 match; nobody else does.
	await p1.reload();
	await expect(p1.getByRole('heading', { name: 'Holiday approved' })).toBeVisible();
	await expect(
		p1.getByRole('region', { name: 'Unlocked early' }).getByText('Holiday 4')
	).toBeVisible();
	for (const id of [player('holiday', 2), null]) {
		const someone = id ? await browser.newPage(as(id)) : await browser.newPage();
		expect((await someone.goto(`/seasons/${slug}/matches/${early}`))?.status()).toBe(404);
	}

	// Holiday 4 reports it through the form (2–0 to Holiday 4).
	const p4 = await browser.newPage(as(player('holiday', 4)));
	await p4.goto(`/seasons/${slug}/matches/${early}`);
	const game = (n: number) => p4.getByRole('radiogroup', { name: new RegExp(`^Game ${n}`) });
	await p4.getByLabel('Legend').nth(0).selectOption('Ahri');
	await p4.getByLabel('Legend').nth(1).selectOption('Annie');
	await p4.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel('Holiday 4').check();
	await game(1).getByLabel('Holiday 4').check();
	await game(2).getByLabel('Holiday 4').check();
	await p4.getByRole('button', { name: 'Add result' }).click();
	await p4.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(p4.getByRole('status')).toContainText(
		'It stays hidden from everyone else until week 2 is published'
	);
	await expect(
		p4.getByText('Played early, hidden from standings until week 2 is published')
	).toBeVisible();

	// Hidden: standings (API), public audit log, results channel.
	const standings = async () =>
		(
			(await (await fetch(`http://localhost:${PORT}/api/v1/seasons/${slug}`)).json()) as {
				groups: { standings: { played: number }[] }[];
			}
		).groups[0].standings.map((r) => r.played);
	expect(await standings()).toEqual([0, 0, 0, 0]);
	const visitor = await browser.newPage();
	await visitor.goto(`/seasons/${slug}/audit`);
	await expect(visitor.getByText('Holiday 1 — holiday').first()).toBeVisible();
	await expect(visitor.getByText(/Holiday 1 0–2 Holiday 4/)).toHaveCount(0);
	expect((await posts('results')).some((b) => b.embeds?.[0].title.includes('Holiday 4'))).toBe(
		false
	);

	// Publish week 2: the result shows and posts once.
	await org.goto(`/seasons/${slug}/admin`);
	await org.getByRole('button', { name: 'Publish week 2' }).click();
	await org.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
	await expect(org.getByRole('status')).toContainText('Week 2 published');
	await expect
		.poll(
			async () =>
				(await posts('results')).filter((b) => b.embeds?.[0].title === 'Holiday 1 0–2 Holiday 4')
					.length
		)
		.toBe(1);
	expect(await standings()).toContain(1);
	await visitor.goto(`/seasons/${slug}/matches/${early}`);
	await expect(
		visitor.getByRole('heading', { level: 1, name: 'Holiday 1 vs Holiday 4' })
	).toBeVisible();
	await visitor.goto(`/seasons/${slug}/audit`);
	await expect(visitor.getByText(/Holiday 1 0–2 Holiday 4/)).toBeVisible();
});
