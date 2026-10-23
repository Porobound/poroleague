// Dev-only phone check: opens pages at 390×844 in headless Chrome as a visitor, a player and an
// organizer, and reports sideways scroll and small tap targets, with a screenshot of each page.
// Runs against a production preview of a COPY of the database, never local.db. Start the preview with
//   NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9
// so the organizer re-check can't reach Discord and the fake session keeps its role.
// Usage: node scripts/mobile-check.ts <base-url> <db-copy> <out-dir>
import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [base, dbPath, out] = process.argv.slice(2);
if (!base || !dbPath || !out)
	throw new Error('usage: mobile-check.ts <base-url> <db-copy> <out-dir>');
if (/(^|\/)local\.db$/.test(dbPath)) throw new Error('use a copy of the database, not local.db');
// MOBILE_CHECK_SIZE=1280x900 checks desktop instead.
const [W, H] = (process.env.MOBILE_CHECK_SIZE ?? '390x844').split('x').map(Number);
const phone = W < 641;
mkdirSync(out, { recursive: true });

const db = new Database(dbPath);
const get = <T>(sql: string, ...args: unknown[]) => db.prepare(sql).get(...args) as T | undefined;
const season = (status: string) =>
	get<{ id: number; slug: string }>(
		'select id, slug from seasons where status = ? and deleted_at is null order by id desc',
		status
	);
const play = season('play');
if (!play) throw new Error('the database needs a season in play');
const signup = season('signup');
const draft = season('draft');
// The player: a real (non-dev) player in the season in play, else anyone in it.
const me = get<{ id: string }>(
	"select player_id as id from entries where season_id = ? and dropped = 0 order by player_id like 'dev-%', player_id",
	play.id
)!;
const match = (where: string) =>
	get<{ id: number }>(
		`select id from matches where season_id = ? and (p1_id = ? or p2_id = ?) and ${where}
		 and round <= (select published_round from seasons where id = matches.season_id) order by round`,
		play.id,
		me.id,
		me.id
	)?.id;
const open = match('reported_at is null');
const reported = match('reported_at is not null and flagged_by is null');

const s = `/seasons/${play.slug}`;
const pages: Record<string, string[]> = {
	visitor: [
		'/seasons',
		s,
		`${s}/schedule`,
		`${s}/legends`,
		`${s}/audit`,
		`${s}/players/${me.id}`,
		`/players/${me.id}`,
		...(reported ? [`${s}/matches/${reported}`] : []),
		...(signup ? [`/seasons/${signup.slug}`] : []),
		'/login/not-member',
		'/login/failed'
	],
	player: [
		s,
		`${s}/schedule`,
		`${s}/players/${me.id}`,
		...(open ? [`${s}/matches/${open}`] : []),
		...(reported ? [`${s}/matches/${reported}`] : []),
		...(signup ? [`/seasons/${signup.slug}`] : []),
		'/login/not-organizer'
	],
	organizer: [
		`${s}/admin`,
		`${s}/admin/players`,
		`${s}/admin/groups`,
		`${s}/admin/matches`,
		`${s}/admin/season`,
		...(draft ? [`/seasons/${draft.slug}/admin/season`] : []),
		...(reported ? [`${s}/matches/${reported}`] : [])
	]
};

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const tokens: Record<string, string> = {};
const expires = Math.floor(Date.now() / 1000) + 3600;
for (const [role, organizer] of [
	['player', 0],
	['organizer', 1]
] as const) {
	tokens[role] = randomBytes(32).toString('base64url');
	db.prepare(
		"insert into sessions (id, player_id, access_token, is_organizer, expires_at) values (?, ?, 'mobile-check', ?, ?)"
	).run(hash(tokens[role]), me.id, organizer, expires);
}

// Runs in the page. Measures against the set width, not innerWidth: mobile emulation widens the
// layout viewport to fit content that's too wide. Reports the outermost elements past the right edge (unless inside a scroller that fits),
// and controls smaller than 44 px (inline links inside text don't count).
const probe = `(() => {
	const W = ${W}, label = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + ' "' + (el.textContent || '').trim().slice(0, 30) + '"';
	const scrolled = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible' && p.getBoundingClientRect().right <= W + 1) return true; } return false; };
	const over = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > W + 1 && !scrolled(el); });
	const outer = over.filter((el) => !over.includes(el.parentElement)).slice(0, 8).map(label);
	const small = [...document.querySelectorAll('a, button, select, textarea, summary, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), label:has(> input[type=radio]), label:has(> input[type=checkbox])')]
		.filter((el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); if (!r.width || cs.visibility === 'hidden' || cs.opacity === '0') return false; if (cs.display === 'inline' && el.closest('p, li, td, dd')) return false; return r.height < 44; })
		.slice(0, 20).map((el) => label(el) + ' ' + Math.round(el.getBoundingClientRect().height) + 'px');
	return { scroll: document.documentElement.scrollWidth > W || innerWidth > W, outer, small };
})()`;

const port = 9333;
const chrome = spawn(
	process.env.CHROME ?? 'google-chrome-stable',
	[
		'--headless=new',
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${mkdtempSync(join(tmpdir(), 'mobile-check-'))}`,
		'--no-first-run',
		'about:blank'
	],
	{ stdio: 'ignore' }
);
let failed = false;
try {
	let target: { webSocketDebuggerUrl: string } | undefined;
	for (let i = 0; i < 50 && !target; i++) {
		target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
			.then((r) => r.json())
			.catch(() => new Promise((r) => setTimeout(() => r(undefined), 200)));
	}
	if (!target) throw new Error('Chrome did not start');
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((r) => ws.addEventListener('open', r, { once: true }));
	let seq = 0;
	const waiting = new Map<number, (v: any) => void>();
	const events = new Map<string, () => void>();
	ws.addEventListener('message', (e) => {
		const msg = JSON.parse(String(e.data));
		if (msg.id) waiting.get(msg.id)?.(msg.result ?? msg.error);
		else events.get(msg.method)?.();
	});
	const send = (method: string, params = {}) =>
		new Promise<any>((r) => {
			waiting.set(++seq, r);
			ws.send(JSON.stringify({ id: seq, method, params }));
		});
	const loaded = () => new Promise<void>((r) => events.set('Page.loadEventFired', r));
	await send('Page.enable');
	await send('Network.enable');
	await send('Emulation.setDeviceMetricsOverride', {
		width: W,
		height: H,
		deviceScaleFactor: phone ? 2 : 1,
		mobile: phone
	});
	await send('Emulation.setTouchEmulationEnabled', { enabled: phone });

	const report: Record<string, unknown>[] = [];
	for (const [role, paths] of Object.entries(pages)) {
		await send('Network.clearBrowserCookies');
		if (tokens[role])
			await send('Network.setCookie', { name: 'session', value: tokens[role], url: base });
		for (const path of paths) {
			const done = loaded();
			await send('Page.navigate', { url: base + path });
			await done;
			await new Promise((r) => setTimeout(r, 300));
			const { result } = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
			const { cssContentSize } = await send('Page.getLayoutMetrics');
			const shot = await send('Page.captureScreenshot', {
				format: 'png',
				captureBeyondViewport: true,
				clip: { x: 0, y: 0, width: W, height: Math.ceil(cssContentSize.height), scale: 1 }
			});
			const file = `${role}${path.replaceAll('/', '_')}.png`;
			writeFileSync(join(out, file), Buffer.from(shot.data, 'base64'));
			const r = result.value as { scroll: boolean; outer: string[]; small: string[] };
			// Fixed bars don't widen the page, so something cut off counts too.
			failed ||= r.scroll || r.outer.length > 0;
			report.push({ role, path, file, ...r });
			console.log(
				`${r.scroll ? 'SCROLL' : r.outer.length ? 'EDGE  ' : 'ok    '} ${String(r.small.length).padStart(2)} small  ${role.padEnd(9)} ${path}`
			);
			for (const o of r.outer) console.log(`         past edge: ${o}`);
		}
	}
	writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, '\t'));
	ws.close();
} finally {
	chrome.kill();
	db.prepare("delete from sessions where access_token = 'mobile-check'").run();
	db.close();
}
process.exit(failed ? 1 : 0);
