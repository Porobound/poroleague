// Layout and motion that depend on the device: touch targets on phones, one-line header on
// tablets, no motion for people who asked for less, browser chrome in the theme's colour.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { SEASONS, as, player, playerName } from './fixtures.ts';

const s = `/seasons/${SEASONS.device}`;
const me = player('device', 1);
const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let reported: number;

// A season a week in: Device 1 has a reported round 1 and an open round 2.
test.beforeAll(() => {
	[reported] = seedSeason('device', { publishedRound: 3, startDate: day(-7), deadline: day(30) });
	seedResult(reported, 2, 0);
});
test.afterAll(() => removeSeason('device'));

const height = async (l: Locator) => (await l.boundingBox())!.height;
// Keyframe animations only: colour transitions on hover and focus are not motion.
const animations = (page: Page) =>
	page.evaluate(() => document.getAnimations().filter((x) => x instanceof CSSAnimation).length);

test.describe('phone', () => {
	test.use({ ...as(me), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('links that stand alone are at least 44px tall', async ({ page }) => {
		await page.goto(s);
		const lone = [
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Poroleague' }),
			page.getByRole('link', { name: 'Your page' }),
			page.getByRole('table').getByRole('link', { name: playerName('device', 2) }),
			page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Privacy' })
		];
		for (const link of lone) expect(await height(link)).toBeGreaterThanOrEqual(44);

		await page.goto(`${s}/players/${me}`);
		expect(await height(page.getByRole('link', { name: 'Career' }))).toBeGreaterThanOrEqual(44);

		await page.goto(`${s}/matches/${reported}`);
		expect(await height(page.getByRole('link', { name: 'Back to season' }))).toBeGreaterThanOrEqual(
			44
		);
	});
});

test.describe('tablet', () => {
	test.use({ ...as(me), viewport: { width: 768, height: 1024 } });

	test('the header keeps every link on one line', async ({ page }) => {
		await page.goto(s);
		const nav = page.getByRole('navigation', { name: 'Main' });
		const tops = await Promise.all(
			['Season', 'Schedule', 'Legends', 'Archive', 'Rules'].map(
				async (name) => (await nav.getByRole('link', { name, exact: true }).boundingBox())!.y
			)
		);
		expect(new Set(tops.map(Math.round)).size).toBe(1);
		await expect(nav.getByRole('button', { name: 'Log out' })).toBeInViewport();
	});
});

test.describe('wide screen', () => {
	test.use({ viewport: { width: 1600, height: 900 } });

	test('the footer disclaimer lines up with the footer row above it', async ({ page }) => {
		await page.goto(s);
		const footer = page.getByRole('contentinfo');
		const left = async (l: Locator) => (await l.boundingBox())!.x;
		expect(await left(footer.getByText(/Legal Jibber Jabber/))).toBe(
			await left(footer.getByText('Poroleague', { exact: true }))
		);
	});
});

test('only a badge about something happening now pulses', async ({ page }) => {
	const pulsing = () =>
		page.evaluate(
			() =>
				document
					.getAnimations()
					.filter((x) => x instanceof CSSAnimation && x.animationName === 'pb-live-dot').length
		);
	// The running season's badge in the archive is live.
	await page.goto('/seasons');
	expect(await pulsing()).toBe(1);
	// The audit log is about the past: its badges stay still, whatever their colour.
	await page.goto(`${s}/audit`);
	await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
	expect(await pulsing()).toBe(0);
});

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('nothing animates and navigation still works', async ({ page }) => {
		await page.goto(s);
		expect(await animations(page)).toBe(0);
		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Rules' })
			.click();
		await expect(page.getByRole('heading', { level: 1, name: 'Poroleague Rules' })).toBeVisible();
		expect(await animations(page)).toBe(0);
	});
});

test('pages cross-fade and land on the new page', async ({ page }) => {
	await page.goto(s);
	const nav = page.getByRole('navigation', { name: 'Main' });
	await nav.getByRole('link', { name: 'Schedule' }).click();
	await expect(page).toHaveURL(`${s}/schedule`);
	await expect(page.getByRole('heading', { level: 1, name: 'Schedule' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Schedule' })).toHaveAttribute('aria-current', 'page');
});

test('the browser chrome colour follows the theme', async ({ page }) => {
	await page.goto('/rules');
	const colour = page.locator('meta[name="theme-color"]');
	await expect(colour).toHaveAttribute('content', '#10141a');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('button', { name: 'Switch to light mode' })
		.click();
	await expect(colour).toHaveAttribute('content', '#f6f4ef');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('button', { name: 'Switch to dark mode' })
		.click();
});
