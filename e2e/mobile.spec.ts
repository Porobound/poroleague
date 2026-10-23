// Every page at phone width, as a visitor, a player and an organizer: fails on sideways scroll or
// anything cut off at the right edge. Controls under 44 px tall are warnings, logged per page.
import { expect, test } from '@playwright/test';
import { removeSeason, seedEmptySeason, seedResult, seedSeason } from './db.ts';
import { ORGANIZER, SEASONS, as, player } from './fixtures.ts';

const W = 390;
const s = `/seasons/${SEASONS.mobile}`;
const me = player('mobile', 1);
let open: number;
let reported: number;

test.beforeAll(() => {
	const ids = seedSeason('mobile', { publishedRound: 3 });
	[reported, , open] = ids; // Mobile 1's round 1 and round 2 matches
	seedResult(reported, 2, 1);
	seedEmptySeason('mobileSignup', 'signup');
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
		s,
		`${s}/schedule`,
		`${s}/legends`,
		`${s}/audit`,
		`${s}/players/${me}`,
		`/players/${me}`,
		`${s}/matches/${reported}`,
		`/seasons/${SEASONS.mobileSignup}`,
		'/login/not-member',
		'/login/failed'
	],
	player: [
		s,
		`${s}/schedule`,
		`${s}/players/${me}`,
		`${s}/matches/${open}`,
		`${s}/matches/${reported}`,
		`/seasons/${SEASONS.mobileSignup}`,
		'/login/not-organizer'
	],
	organizer: [
		`${s}/admin`,
		`${s}/admin/players`,
		`${s}/admin/groups`,
		`${s}/admin/matches`,
		`${s}/admin/season`,
		`/seasons/${SEASONS.mobileDraft}/admin/season`,
		`${s}/matches/${reported}`
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

for (const role of ['visitor', 'player', 'organizer'] as const) {
	test.describe(role, () => {
		if (role !== 'visitor') test.use(as(role === 'player' ? me : ORGANIZER));
		// Paths need the seeded ids, so each role is one test that checks every page.
		test('pages fit a phone', async ({ page }) => {
			for (const path of pages()[role]) {
				await test.step(path, async () => {
					const res = await page.goto(path);
					expect(res?.ok()).toBe(true);
					const r = await page.evaluate(probe, W);
					expect.soft(r.scroll, 'scrolls sideways').toBe(false);
					expect.soft(r.outer, 'cut off at the right edge').toEqual([]);
					if (r.small.length) {
						test
							.info()
							.annotations.push({ type: 'small', description: `${path}: ${r.small.join(', ')}` });
						console.log(
							`${r.small.length} small  ${role.padEnd(9)} ${path}\n  ${r.small.join('\n  ')}`
						);
					}
				});
			}
		});
	});
}
