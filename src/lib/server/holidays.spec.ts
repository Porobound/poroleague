import { isHttpError, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	actions as playerPageActions,
	load as playerPage
} from '../../routes/seasons/[slug]/players/[id]/+page.server.ts';
import { auditLines } from '#lib/server/auditLog.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, holidays, players, seasons } from '#lib/server/db/schema.ts';
import {
	cancelHoliday,
	decideHoliday,
	getHoliday,
	requestHoliday,
	seasonUnlocks
} from '#lib/server/holidays.ts';
import type { Season } from '#lib/server/seasons.ts';
import {
	seedEntries,
	seedHoliday,
	seedMatch,
	seedPlayers,
	seedSeason
} from '#lib/server/test/seed.ts';

const hooks = vi.hoisted(() => ({ postResult: vi.fn(), postToOrganizers: vi.fn() }));
vi.mock('#lib/server/webhooks.ts', async (o) => ({
	...(await o<typeof import('#lib/server/webhooks.ts')>()),
	...hooks
}));

type User = NonNullable<App.Locals['user']>;
const as = (id: string, isOrganizer = false): User => ({
	id,
	displayName: id === 'org' ? 'Org' : `Player ${id.slice(1)}`,
	avatar: null,
	isOrganizer
});
const ORG = as('org', true);

// A fake RequestEvent: just what the loads and actions read.
function event(
	params: Record<string, string>,
	user: User | null,
	form: Record<string, string> = {}
) {
	const url = new URL(`http://localhost/seasons/${params.slug}`);
	const body = new FormData();
	for (const [k, v] of Object.entries(form)) body.set(k, v);
	return {
		params,
		url,
		locals: { user, session: user && { id: 'sess', accessToken: 'tok' } },
		request: new Request(url, { method: 'POST', body })
	} as never;
}
async function outcome(p: unknown) {
	try {
		return { returned: await p };
	} catch (e) {
		if (isRedirect(e)) return { redirect: e.location };
		if (isHttpError(e)) return { error: e.status };
		throw e;
	}
}
const returned = async (p: unknown) => (await outcome(p)).returned as Record<string, unknown>;
const status = async (p: unknown) => ((await outcome(p)).returned as { status?: number })?.status;
const loaded = async (p: unknown) => (await p) as Record<string, never>;

const range = { from: '2026-10-12', to: '2026-10-14' }; // week 2
let season: Season;

// "Today" is Thu 8 Oct, in week 1.
beforeEach(() => {
	vi.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z'), toFake: ['Date'] });
	hooks.postResult.mockClear();
	hooks.postToOrganizers.mockClear();
});
afterEach(() => vi.useRealTimers());

// In play: p1–p4 in one group, start 5 Oct, 2 rounds a week, rounds 1–3, rounds 1–2 published.
beforeEach(() => {
	seedPlayers(4);
	db.insert(players).values({ id: 'org', displayName: 'Org' }).run();
	season = seedSeason({
		status: 'play',
		startDate: '2026-10-05',
		roundsPerWeek: 2,
		publishedRound: 2,
		deadline: '2026-10-25'
	});
	seedEntries(season.id, ['p1', 'p2', 'p3', 'p4'], 1);
	for (const [round, p1Id, p2Id] of [
		[1, 'p1', 'p2'],
		[1, 'p3', 'p4'],
		[2, 'p1', 'p3'],
		[2, 'p2', 'p4'],
		[3, 'p1', 'p4'],
		[3, 'p2', 'p3']
	] as const)
		seedMatch({ seasonId: season.id, group: 1, round, p1Id, p2Id });
});

describe('holiday writes', () => {
	it('requestHoliday stores a pending request, unaudited', () => {
		const h = requestHoliday(season.id, 'p1', range);
		expect(h.status).toBe('pending');
		expect(db.select().from(audit).all()).toEqual([]);
	});

	it('cancelHoliday cancels only your own pending request, unaudited', () => {
		const h = requestHoliday(season.id, 'p1', range);
		expect(cancelHoliday(season.id, h.id, 'p2')).toBe(false);
		expect(cancelHoliday(season.id, h.id, 'p1')).toBe(true);
		expect(getHoliday(season.id, h.id)!.status).toBe('cancelled');
		expect(cancelHoliday(season.id, h.id, 'p1')).toBe(false);
		expect(db.select().from(audit).all()).toEqual([]);
	});

	it('decideHoliday records who and when and audits without the reason', () => {
		const h = requestHoliday(season.id, 'p1', range);
		decideHoliday(h, 'org', 'rejected', 'Ask a week ahead.');
		const row = getHoliday(season.id, h.id)!;
		expect(row).toMatchObject({
			status: 'rejected',
			decidedBy: 'org',
			reason: 'Ask a week ahead.'
		});
		expect(row.decidedAt).toBeInstanceOf(Date);
		const [a] = db.select().from(audit).all();
		expect(a).toMatchObject({
			action: 'holiday',
			actorId: 'org',
			matchId: null,
			after: { holiday: 'p1', ...range, status: 'rejected' }
		});
		expect(JSON.stringify(a)).not.toContain('Ask a week ahead');
	});

	it('seasonUnlocks: approved and revoked holidays of this season only', () => {
		const other = seedSeason({ slug: 's2', status: 'finished', startDate: '2026-10-05' });
		seedHoliday({ seasonId: season.id, playerId: 'p1', ...range, status: 'approved' });
		seedHoliday({ seasonId: season.id, playerId: 'p2', ...range, status: 'revoked' });
		seedHoliday({ seasonId: season.id, playerId: 'p3', ...range, status: 'pending' });
		seedHoliday({ seasonId: other.id, playerId: 'p4', ...range, status: 'approved' });
		const { unlocked, away } = seasonUnlocks(season);
		expect([...unlocked.keys()]).toEqual(['p1', 'p2']);
		expect([...unlocked.get('p1')!]).toEqual([2]);
		expect([...away.keys()]).toEqual(['p1']);
	});
});

describe('audit lines', () => {
	it('reads "Player 1 — holiday 12–14 Oct approved" for everyone', () => {
		decideHoliday(requestHoliday(season.id, 'p1', range), 'org', 'approved');
		const [l] = auditLines(season.id, { publishedRound: 0 });
		expect([l.label, l.what]).toEqual(['Holiday', 'Player 1 — holiday 12–14 Oct approved']);
	});
});

describe('player asks for a holiday', () => {
	const ask = (user: User | null, id = 'p1', r: Record<string, string> = range) =>
		playerPageActions.requestHoliday!(event({ slug: 's1', id }, user, r));

	it('on their own page: a pending request and a post to organizers', async () => {
		expect(await returned(ask(as('p1')))).toEqual({
			message: 'Holiday requested for 12–14 Oct. An organizer will look at it.'
		});
		expect(db.select().from(holidays).all()).toMatchObject([
			{ playerId: 'p1', ...range, status: 'pending' }
		]);
		expect(hooks.postToOrganizers).toHaveBeenCalledOnce();
		expect(hooks.postToOrganizers.mock.calls[0][0]).toMatchObject({
			title: 'Holiday request: Player 1',
			description: 'Away 12–14 Oct · week 2 (round 3). Approve or reject in season admin.',
			url: 'http://localhost/seasons/s1/admin/season#holidays'
		});
	});

	it('not for someone else, logged out, outside play or outside the season', async () => {
		expect(await outcome(ask(as('p2')))).toEqual({ error: 403 });
		expect((await outcome(ask(null))).redirect).toMatch(/^\/auth\/login/);
		db.insert(players).values({ id: 'p5', displayName: 'Player 5' }).run();
		expect(await outcome(ask(as('p5'), 'p5'))).toEqual({ error: 403 });
		db.update(seasons).set({ status: 'topcut' }).run();
		expect(await status(ask(as('p1')))).toBe(409);
		expect(db.select().from(holidays).all()).toEqual([]);
		expect(hooks.postToOrganizers).not.toHaveBeenCalled();
	});

	it('within the limits', async () => {
		const r = await returned(ask(as('p1'), 'p1', { from: '2026-10-01', to: '2026-10-14' }));
		expect(r).toMatchObject({ status: 400, data: { holidayError: expect.stringMatching(/past/) } });
		expect(db.select().from(holidays).all()).toEqual([]);
	});

	it('cancels a pending request once', async () => {
		await ask(as('p1'));
		const [h] = db.select().from(holidays).all();
		const cancel = () =>
			playerPageActions.cancelHoliday!(
				event({ slug: 's1', id: 'p1' }, as('p1'), { id: String(h.id) })
			);
		expect(await returned(cancel())).toEqual({ message: 'Request cancelled.' });
		expect(await status(cancel())).toBe(409);
		expect(db.select().from(audit).all()).toEqual([]);
	});
});

describe('holiday cards on the player page', () => {
	beforeEach(() => {
		seedHoliday({ seasonId: season.id, playerId: 'p1', ...range, status: 'pending' });
		seedHoliday({
			seasonId: season.id,
			playerId: 'p1',
			from: '2026-10-15',
			to: '2026-10-16',
			status: 'rejected',
			reason: 'Ask a week ahead.'
		});
		seedHoliday({ seasonId: season.id, playerId: 'p1', ...range, status: 'cancelled' });
	});
	const page = (user: User | null) => loaded(playerPage(event({ slug: 's1', id: 'p1' }, user)));

	it('the player sees their own, newest first, with the reason', async () => {
		const d = await page(as('p1'));
		expect(d.holidays).toEqual([
			expect.objectContaining({
				status: 'rejected',
				away: '15–16 Oct',
				covers: 'week 2 (round 3)',
				reason: 'Ask a week ahead.'
			}),
			expect.objectContaining({ status: 'pending', away: '12–14 Oct', reason: null })
		]);
		expect(d.canRequest).toBe(true);
		expect(d.calendar).toMatchObject({ today: '2026-10-08', maxRound: 3, publishedRound: 2 });
	});

	it('nobody else does', async () => {
		for (const user of [as('p2'), ORG, null]) {
			const d = await page(user);
			expect([d.holidays, d.canRequest, d.calendar]).toEqual([[], false, null]);
			expect(JSON.stringify(d)).not.toContain('Ask a week ahead');
		}
	});
});
