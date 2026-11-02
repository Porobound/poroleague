import { isHttpError, isRedirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	actions as playerPageActions,
	load as playerPage
} from '../../routes/seasons/[slug]/players/[id]/+page.server.ts';
import {
	actions as matchActions,
	load as matchPage
} from '../../routes/seasons/[slug]/matches/[id]/+page.server.ts';
import {
	actions as adminMatchActions,
	load as adminMatchesPage
} from '../../routes/seasons/[slug]/admin/matches/+page.server.ts';
import { load as schedulePage } from '../../routes/seasons/[slug]/schedule/+page.server.ts';
import {
	actions as seasonActions,
	load as seasonAdminPage
} from '../../routes/seasons/[slug]/admin/season/+page.server.ts';
import { auditLines } from '#lib/server/auditLog.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, holidays, matches, players, seasons } from '#lib/server/db/schema.ts';
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

// The Discord re-check has its own tests (auth.spec.ts); here the session's role is trusted.
vi.mock('#lib/server/auth.ts', async (original) => {
	const { redirect } = await import('@sveltejs/kit');
	const currentRole = async ({ locals }: { locals: App.Locals }) => !!locals.user?.isOrganizer;
	const organizer = async ({ locals }: { locals: App.Locals }) => {
		if (!locals.user?.isOrganizer) redirect(303, '/login/not-organizer');
		return locals.user;
	};
	return {
		...(await original<typeof import('#lib/server/auth.ts')>()),
		currentRole,
		organizerAction: organizer,
		organizerPage: organizer
	};
});

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
let m13: number, m23: number;

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
	[, , , , m13, m23] = (
		[
			[1, 'p1', 'p2'],
			[1, 'p3', 'p4'],
			[2, 'p1', 'p3'],
			[2, 'p2', 'p4'],
			[3, 'p1', 'p4'],
			[3, 'p2', 'p3']
		] as const
	).map(
		([round, p1Id, p2Id]) => seedMatch({ seasonId: season.id, group: 1, round, p1Id, p2Id }).id
	);
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

describe('organizers decide', () => {
	let pending: number, approved: number;
	beforeEach(() => {
		pending = seedHoliday({
			seasonId: season.id,
			playerId: 'p1',
			...range,
			createdAt: new Date('2026-10-07T10:00:00Z')
		}).id;
		approved = seedHoliday({
			seasonId: season.id,
			playerId: 'p2',
			...range,
			status: 'approved',
			decidedBy: 'org',
			decidedAt: new Date()
		}).id;
	});
	const act = (
		name: 'approveHoliday' | 'rejectHoliday' | 'revokeHoliday',
		id: number | string,
		user: User | null = ORG,
		form: Record<string, string> = {}
	) => seasonActions[name]!(event({ slug: 's1' }, user, { id: String(id), ...form }));
	const row = (id: number) => getHoliday(season.id, id)!;
	const audits = () => db.select().from(audit).all();

	it('approves a pending holiday once, with an audit row', async () => {
		expect(await returned(act('approveHoliday', pending))).toEqual({
			message: 'Holiday approved for Player 1. It’s in the audit log.'
		});
		expect(row(pending)).toMatchObject({ status: 'approved', decidedBy: 'org' });
		expect(audits()).toMatchObject([{ action: 'holiday', after: { status: 'approved' } }]);
		expect(await status(act('approveHoliday', pending))).toBe(409);
		expect(await status(act('approveHoliday', approved))).toBe(409);
		expect(audits()).toHaveLength(1);
	});

	it('rejects with an optional reason kept off the audit row', async () => {
		expect(await status(act('rejectHoliday', pending, ORG, { reason: 'x'.repeat(501) }))).toBe(400);
		await act('rejectHoliday', pending, ORG, { reason: '  Ask a week ahead.  ' });
		expect(row(pending)).toMatchObject({ status: 'rejected', reason: 'Ask a week ahead.' });
		expect(JSON.stringify(audits())).not.toContain('Ask a week ahead');
		const other = requestHoliday(season.id, 'p3', range).id;
		await act('rejectHoliday', other);
		expect(row(other)).toMatchObject({ status: 'rejected', reason: null });
	});

	it('revokes only an approved holiday', async () => {
		expect(await status(act('revokeHoliday', pending))).toBe(409);
		expect(await returned(act('revokeHoliday', approved))).toEqual({
			message: 'Holiday revoked for Player 2. It’s in the audit log.'
		});
		expect(row(approved).status).toBe('revoked');
	});

	it('organizers only, in play only, this season’s holidays only', async () => {
		for (const name of ['approveHoliday', 'rejectHoliday', 'revokeHoliday'] as const) {
			expect(await outcome(act(name, pending, as('p3')))).toEqual({
				redirect: '/login/not-organizer'
			});
			expect(await outcome(act(name, 'junk'))).toEqual({ error: 404 });
		}
		const other = seedSeason({ slug: 's2', status: 'finished' });
		const theirs = seedHoliday({ seasonId: other.id, playerId: 'p1', ...range }).id;
		expect(await outcome(act('approveHoliday', theirs))).toEqual({ error: 404 });
		db.update(seasons).set({ status: 'topcut' }).where(eq(seasons.id, season.id)).run();
		expect(await status(act('approveHoliday', pending))).toBe(409);
		expect(await status(act('revokeHoliday', approved))).toBe(409);
		expect(audits()).toEqual([]);
	});

	it('the admin page lists pending and approved holidays in play', async () => {
		// Player 2's round 3 match (vs Player 3) is unlocked; report it.
		db.update(matches)
			.set({ reportedBy: 'p2', p1Games: 2, p2Games: 0 })
			.where(and(eq(matches.round, 3), eq(matches.p1Id, 'p2')))
			.run();
		const load = (s: Season) =>
			loaded(seasonAdminPage({ parent: async () => ({ season: s }) } as never));
		const d = await load(season);
		expect(d.holidays).toEqual({
			pending: [
				{
					id: pending,
					player: { name: 'Player 1', avatar: null, former: false, href: '/seasons/s1/players/p1' },
					away: '12–14 Oct',
					covers: 'week 2 (round 3)',
					asked: '7 Oct 2026'
				}
			],
			approved: [
				expect.objectContaining({ id: approved, early: '1 of 1 played', decided: '8 Oct 2026' })
			]
		});
		expect((await load({ ...season, status: 'topcut' })).holidays).toBeNull();
	});
});

describe('unlocked matches', () => {
	let h: number;
	beforeEach(() => {
		h = seedHoliday({ seasonId: season.id, playerId: 'p1', ...range, status: 'approved' }).id;
	});
	const setHoliday = (status: 'pending' | 'rejected' | 'revoked') =>
		db.update(holidays).set({ status }).where(eq(holidays.id, h)).run();
	const match = (id: number, user: User | null) =>
		outcome(matchPage(event({ slug: 's1', id: String(id) }, user)));
	const mode = async (id: number, user: User | null) =>
		((await match(id, user)).returned as { mode?: string } | undefined)?.mode ??
		(await match(id, user)).error;
	const result = { game1: '2', game2: '2', p1Legend: 'Jinx', p2Legend: 'Ahri', dice: 'p4' };
	const report = (user: User) =>
		matchActions.report!(event({ slug: 's1', id: String(m13) }, user, result));
	const cards = async (id: string, user: User | null) =>
		((await loaded(playerPage(event({ slug: 's1', id }, user)))).early as { id: number }[]).map(
			(c) => c.id
		);

	it('the match page opens for its two players and organizers only', async () => {
		expect(await mode(m13, as('p1'))).toBe('report');
		expect(await mode(m13, as('p4'))).toBe('report');
		expect(await mode(m13, as('p2'))).toBe(404);
		expect(await mode(m13, null)).toBe(404);
		expect(await mode(m13, ORG)).toBe('view');
		for (const user of [as('p2'), as('p1'), ORG, null]) expect(await mode(m23, user)).toBe(404);
	});

	it('pending and rejected holidays unlock nothing; a revoke keeps the match open', async () => {
		setHoliday('pending');
		expect(await mode(m13, as('p1'))).toBe(404);
		setHoliday('rejected');
		expect(await mode(m13, as('p1'))).toBe(404);
		setHoliday('revoked');
		expect(await mode(m13, as('p1'))).toBe('report');
	});

	it('a report stays off the results channel; a flag reaches organizers', async () => {
		expect(await returned(report(as('p4')))).toEqual({
			message: 'Result saved. It stays hidden from everyone else until week 2 is published.'
		});
		expect(db.select().from(matches).where(eq(matches.id, m13)).get()).toMatchObject({
			reportedBy: 'p4',
			p1Games: 0,
			p2Games: 2
		});
		expect(hooks.postResult).not.toHaveBeenCalled();
		await matchActions.flag!(
			event({ slug: 's1', id: String(m13) }, as('p1'), { reason: 'Wrong legend' })
		);
		expect(hooks.postToOrganizers).toHaveBeenCalledOnce();
		expect(hooks.postResult).not.toHaveBeenCalled();
	});

	it('the player pages list it for its two players only', async () => {
		expect(await cards('p1', as('p1'))).toEqual([m13]);
		expect(await cards('p1', as('p4'))).toEqual([m13]);
		expect(await cards('p4', as('p4'))).toEqual([m13]);
		expect(await cards('p4', as('p1'))).toEqual([m13]);
		expect(await cards('p1', as('p2'))).toEqual([]);
		expect(await cards('p1', null)).toEqual([]);
		expect(await cards('p2', as('p1'))).toEqual([]);
		const d = await loaded(playerPage(event({ slug: 's1', id: 'p1' }, as('p1'))));
		expect((d.matches as { id: number }[]).map((c) => c.id)).not.toContain(m13);
	});

	it('the schedule still hides it', async () => {
		const d = await loaded(
			schedulePage({
				...(event({ slug: 's1' }, as('p1')) as object),
				url: new URL('http://x/?week=2')
			} as never)
		);
		const ids = [
			...(d.overdue as { id: number }[]),
			...(d.sections as { cards: { id: number }[] }[]).flatMap((s) => s.cards)
		].map((c) => c.id);
		expect(ids).not.toContain(m13);
	});

	it('organizers enter results on unlocked matches only, told in their channel', async () => {
		const edit = (id: number) =>
			adminMatchActions.edit!(event({ slug: 's1' }, ORG, { ...result, matchId: String(id) }));
		expect(await returned(edit(m13))).toEqual({ message: 'Result saved and logged.' });
		expect(hooks.postResult).not.toHaveBeenCalled();
		expect(hooks.postToOrganizers).toHaveBeenCalledOnce();
		expect(await returned(edit(m23))).toMatchObject({
			status: 409,
			data: { message: 'Publish this week before entering results.' }
		});
		const d = await loaded(
			adminMatchesPage({
				parent: async () => ({ season }),
				url: new URL('http://x/')
			} as never)
		);
		expect(d.unlocked).toEqual([m13]);
	});
});

describe('On holiday badge', () => {
	let h: number;
	beforeEach(() => {
		h = seedHoliday({ seasonId: season.id, playerId: 'p1', ...range, status: 'approved' }).id;
	});
	const away = async () =>
		(await loaded(playerPage(event({ slug: 's1', id: 'p1' }, null)))).away as unknown;
	const inWeek2 = () => vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));

	it('shows on the player page only while this week is an approved holiday week', async () => {
		expect(await away()).toBeNull(); // week 1
		inWeek2();
		expect(await away()).toEqual({ dates: '12–14 Oct' });
		db.update(holidays).set({ status: 'pending' }).where(eq(holidays.id, h)).run();
		expect(await away()).toBeNull();
		db.update(holidays).set({ status: 'revoked' }).where(eq(holidays.id, h)).run();
		expect(await away()).toBeNull();
	});

	it('tags the pairing on the schedule once the week is published', async () => {
		inWeek2();
		db.update(seasons).set({ publishedRound: 3 }).where(eq(seasons.id, season.id)).run();
		const d = await loaded(
			schedulePage({
				...(event({ slug: 's1' }, null) as object),
				url: new URL('http://x/?week=2')
			} as never)
		);
		const card = (
			d.sections as { cards: { id: number; props: { sides: { tag: string | null }[] } }[] }[]
		)
			.flatMap((s) => s.cards)
			.find((c) => c.id === m13)!;
		expect(card.props.sides.map((s) => s.tag)).toEqual(['On holiday', null]);
	});
});
