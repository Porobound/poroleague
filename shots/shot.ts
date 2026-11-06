import { readFileSync } from 'node:fs';
import { expect, type Browser } from '@playwright/test';
import { as } from '../e2e/fixtures.ts';
import { NOW } from './now.ts';

const VIEWS = { desktop: { width: 1200, height: 900 }, phone: { width: 390, height: 844 } };
const FONT_CSS = readFileSync('shots/fonts/fonts.css', 'utf8');
const REAL_YEAR = String(new Date().getFullYear());

// Saves shots/images/<view>/<name>.png at both widths, logged in as `who` if given. Fails rather
// than saving an error page, a fallback font or a real date, which would all read as page changes.
export async function shot(browser: Browser, name: string, path: string, who?: string) {
	for (const [view, viewport] of Object.entries(VIEWS)) {
		const ctx = await browser.newContext({
			...(who ? as(who) : {}),
			viewport,
			deviceScaleFactor: 1,
			timezoneId: 'Europe/Helsinki',
			locale: 'en-GB',
			reducedMotion: 'reduce'
		});
		await ctx.route(
			(url) => url.hostname !== 'localhost',
			(r) => r.abort()
		);
		await ctx.route('https://fonts.googleapis.com/**', (r) =>
			r.fulfill({ contentType: 'text/css', body: FONT_CSS })
		);
		await ctx.route('https://fonts.gstatic.com/**', (r) =>
			r.fulfill({
				path: `shots/fonts/${new URL(r.request().url()).pathname.slice(1)}`,
				contentType: 'font/woff2',
				headers: { 'access-control-allow-origin': '*' }
			})
		);
		const page = await ctx.newPage();
		await page.clock.setFixedTime(NOW);
		const res = await page.goto(path, { waitUntil: 'networkidle' });
		expect(res?.ok(), `${path} returned ${res?.status()}`).toBe(true);
		const { failed, loaded, text } = await page.evaluate(async () => {
			await document.fonts.ready;
			const fonts = [...document.fonts];
			return {
				failed: fonts.filter((f) => f.status === 'error').map((f) => f.family),
				loaded: fonts.some((f) => f.status === 'loaded'),
				text: document.body.innerText
			};
		});
		expect(failed, `fonts failed on ${path}`).toEqual([]);
		expect(loaded, `no font loaded on ${path}`).toBe(true);
		expect(text, `real date on ${path}`).not.toContain(REAL_YEAR);
		// A viewport as tall as the page, so the phone's fixed tab bar sits at the end, not over content.
		const height = await page.evaluate(() => document.documentElement.scrollHeight);
		await page.setViewportSize({ width: viewport.width, height });
		await page.screenshot({
			path: `shots/images/${view}/${name}.png`,
			fullPage: true,
			animations: 'disabled',
			caret: 'hide'
		});
		await ctx.close();
	}
}
