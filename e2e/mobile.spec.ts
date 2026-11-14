// Every page at phone width, as a visitor, a player and an organizer: fails on sideways scroll or
// anything cut off at the right edge. Controls under 44 px tall are warnings, logged per page.
import { expect, test, type Page } from '@playwright/test';
import { replayFile } from '../src/lib/server/test/replayFile.ts';
import {
	publishReplays,
	removeSeason,
	renamePlayer,
	seedEmptySeason,
	seedHoliday,
	seedReplay,
	seedResult,
	seedSeason
} from './db.ts';
import { ORGANIZER, SEASONS, as, player } from './fixtures.ts';

const W = 390;
const s = `/seasons/${SEASONS.mobile}`;
const me = player('mobile', 1);
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let open: number;
let reported: number;
let flagged: number;

// A season a week in, with a long name, a reported result and a flagged one, plus a draft (a
// draft can exist next to a running season; a season in signup can't, see the last test).
test.beforeAll(() => {
	const ids = seedSeason('mobile', { publishedRound: 3, startDate: day(-7), deadline: day(30) });
	[reported, , open, flagged] = ids; // Mobile 1's round 1 and 2 matches; Mobile 2 vs 4
	renamePlayer(player('mobile', 2), 'Bartholomew Featherstonehaugh-Villanueva');
	seedResult(reported, 2, 1);
	seedReplay(reported, 1);
	publishReplays(reported);
	seedResult(flagged, 0, 2, {
		flag: 'We played 2-1 but the second game was conceded after a misclick, so this needs a look.'
	});
	// Holiday cards on Mobile 1's page, both holiday lists in Admin → Season.
	seedHoliday('mobile', 1, day(1), day(5), 'approved');
	seedHoliday('mobile', 3, day(1), day(5));
	seedEmptySeason('mobileDraft', 'draft');
});
test.afterAll(() => {
	for (const key of ['mobile', 'mobileSignup', 'mobileDraft'] as const) removeSeason(key);
});

test.use({
	viewport: { width: W, height: 844 },
	deviceScaleFactor: 2,
	isMobile: true,
	hasTouch: true
});

const pages = () => ({
	visitor: [
		'/seasons',
		'/rules',
		s,
		`${s}/schedule`,
		`${s}/schedule?week=1`,
		`${s}/legends`,
		`${s}/audit`,
		`${s}/players/${me}`,
		`/players/${me}`,
		`${s}/matches/${reported}`,
		`${s}/matches/${flagged}`,
		'/login/not-member',
		'/login/failed'
	],
	player: [
		s,
		`${s}/schedule`,
		`${s}/players/${me}`,
		`${s}/matches/${open}`,
		`${s}/matches/${reported}`,
		'/login/not-organizer'
	],
	organizer: [
		'/admin',
		'/admin/players',
		`${s}/admin`,
		`${s}/admin/players`,
		`${s}/admin/groups`,
		`${s}/admin/matches`,
		`${s}/admin/season`,
		`/seasons/${SEASONS.mobileDraft}/admin/season`,
		`${s}/matches/${reported}`,
		`${s}/matches/${flagged}`
	]
});

// Runs in the page. Measures against the set width, not innerWidth: mobile emulation widens the
// layout viewport to fit content that's too wide. Lists the outermost elements past the right edge
// (unless inside a scroller that fits), and controls under 44 px (inline links in text don't count).
function probe(W: number) {
	const label = (el: Element) =>
		el.tagName.toLowerCase() + ' "' + (el.textContent || '').trim().slice(0, 30) + '"';
	const scrolled = (el: Element) => {
		for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
			if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= W + 1)
				return true;
		}
		return false;
	};
	const over = [...document.querySelectorAll('body *')].filter((el) => {
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.right > W + 1 && !scrolled(el);
	});
	const small = [
		...document.querySelectorAll(
			'a, button, select, textarea, summary, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), label:has(> input[type=radio]), label:has(> input[type=checkbox])'
		)
	].filter((el) => {
		const r = el.getBoundingClientRect();
		const cs = getComputedStyle(el);
		if (!r.width || cs.visibility === 'hidden' || cs.opacity === '0') return false;
		if (cs.display === 'inline' && el.closest('p, li, td, dd')) return false;
		return r.height < 44;
	});
	return {
		scroll: document.documentElement.scrollWidth > W || innerWidth > W,
		outer: over.filter((el) => !over.includes(el.parentElement!)).map(label),
		small: small.map((el) => `${label(el)} ${Math.round(el.getBoundingClientRect().height)}px`)
	};
}

// `before` puts the loaded page in the state to measure.
const fits = (page: Page, who: string, path: string, before?: () => Promise<void>) =>
	test.step(`${who} ${path}`, async () => {
		const res = await page.goto(path);
		expect.soft(res?.ok(), 'page loads').toBe(true);
		await before?.();
		const r = await page.evaluate(probe, W);
		expect.soft(r.scroll, 'scrolls sideways').toBe(false);
		expect.soft(r.outer, 'cut off at the right edge').toEqual([]);
		if (r.small.length) {
			test
				.info()
				.annotations.push({ type: 'small', description: `${path}: ${r.small.join(', ')}` });
			console.log(`${r.small.length} small  ${who.padEnd(9)} ${path}\n  ${r.small.join('\n  ')}`);
		}
	});

for (const role of ['visitor', 'player', 'organizer'] as const) {
	test.describe(role, () => {
		if (role !== 'visitor') test.use(as(role === 'player' ? me : ORGANIZER));
		// Paths need the seeded ids, so each role is one test that checks every page.
		test('pages fit a phone', async ({ page }) => {
			for (const path of pages()[role]) await fits(page, role, path);
		});
	});
}

// Both row layouts are measured above with the replay marker beside the long name.
test('the replay marker is on the row with the long name', async ({ page }) => {
	for (const path of [`${s}/schedule?week=1`, `${s}/players/${me}`]) {
		await page.goto(path);
		const row = page.getByRole('link').filter({ hasText: 'Bartholomew Featherstonehaugh' });
		await expect(row.filter({ hasText: 'Replay available' })).toHaveCount(1);
	}
});

// The publish box and the organizer's status line name the opponent; the pages above show them public.
test('one-sided publish states fit a phone', async ({ browser }) => {
	const path = `${s}/matches/${reported}`;
	for (const [p1, p2] of [
		[true, false],
		[false, true],
		[false, false]
	]) {
		publishReplays(reported, p1, p2);
		await fits(await browser.newPage(as(me)), 'player', path);
		await fits(await browser.newPage(as(ORGANIZER)), 'organizer', path);
	}
	publishReplays(reported);
});

// The upload form open, then its which-game step, which names whoever added the replay in the way.
test('the replay upload form fits a phone', async ({ browser }) => {
	const path = `${s}/matches/${reported}`;
	const send = async (page: Page, replayId: string) => {
		await page.getByText('Add or replace a replay').click();
		await page.getByLabel('Replay file').setInputFiles({
			name: `riftatlas-replay-${replayId}-game-2.json`,
			mimeType: 'application/json',
			buffer: Buffer.from(
				replayFile({
					game: 2,
					replayId,
					legends: ['Ahri, Fox', 'Annie, Fire'],
					completedAt: Date.now()
				})
			)
		});
		await page.getByRole('button', { name: 'Upload' }).click();
	};
	const opponent = await browser.newPage(as(player('mobile', 2)));
	await fits(opponent, 'player', path, () => opponent.getByText('Add or replace a replay').click());
	await opponent.reload();
	await send(opponent, 'theirs');
	await expect(opponent.getByRole('status')).toContainText('Replay added for game 2.');
	const mine = await browser.newPage(as(me));
	await fits(mine, 'player', path, async () => {
		await send(mine, 'mine');
		await expect(
			mine.getByText('Replaces the replay added by Bartholomew Featherstonehaugh-Villanueva')
		).toBeVisible();
	});
});

// Scalar renders after load, so /api waits for it; checked in both themes.
test('API reference fits a phone', async ({ page }) => {
	await page.goto('/api');
	for (const theme of ['dark', 'light']) {
		if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
		await expect(page.getByRole('heading', { name: 'Poroleague API' })).toBeVisible();
		const r = await page.evaluate(probe, W);
		expect.soft(r.scroll, `${theme}: scrolls sideways`).toBe(false);
		expect.soft(r.outer, `${theme}: cut off at the right edge`).toEqual([]);
	}
});

// Runs last: only one season can be running, so the season in play makes way for one in signup.
test('signup page fits a phone', async ({ page, browser }) => {
	removeSeason('mobile');
	seedEmptySeason('mobileSignup', 'signup');
	const path = `/seasons/${SEASONS.mobileSignup}`;
	await fits(page, 'visitor', path);
	await fits(await browser.newPage(as(me)), 'player', path);
});
