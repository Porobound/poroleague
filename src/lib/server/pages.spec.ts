import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORGANIZER_ROLE_ID } from '$app/env/private';
import { load as careerPage } from '../../routes/players/[id]/+page.server.ts';
import { load as seasonPage } from '../../routes/seasons/[slug]/+page.server.ts';
import { load as legendsPage } from '../../routes/seasons/[slug]/legends/+page.server.ts';
import { load as playerPage } from '../../routes/seasons/[slug]/players/[id]/+page.server.ts';
import { load as schedulePage } from '../../routes/seasons/[slug]/schedule/+page.server.ts';
import { load as adminPlayersPage } from '../../routes/seasons/[slug]/admin/players/+page.server.ts';
import { load as auditPage } from '../../routes/seasons/[slug]/audit/+page.server.ts';
import { load as adminPage } from '../../routes/seasons/[slug]/admin/+page.server.ts';
import { GET as apiSeason } from '../../routes/api/v1/seasons/[slug]/+server.ts';
import { GET as apiLegends } from '../../routes/api/v1/seasons/[slug]/legends/+server.ts';
import type { Card } from '#lib/matchCard.ts';
import { db } from '#lib/server/db/index.ts';
import {
	audit,
	entries,
	matches,
	playerAchievements,
	players,
	seasons,
	sessions
} from '#lib/server/db/schema.ts';
import { leaderboard } from '#lib/server/players.ts';
import { createSession, validateSession } from '#lib/server/session.ts';
import { and, eq } from 'drizzle-orm';
import {
	seedEntries,
	seedHoliday,
	seedMatch,
	seedPlayers,
	seedSeason
} from '#lib/server/test/seed.ts';

// PageServerLoad's type allows void; these loads always return data.
const loaded =
	<A extends unknown[], R>(f: (...a: A) => R) =>
	async (...a: A) =>
		(await f(...a)) as Exclude<Awaited<R>, void>;
const careerLoad = loaded(careerPage);
const seasonLoad = loaded(seasonPage);
const legendsLoad = loaded(legendsPage);
const playerLoad = loaded(playerPage);
const scheduleLoad = loaded(schedulePage);
const adminPlayersLoad = loaded(adminPlayersPage);
const auditLoad = loaded(auditPage);
const adminLoad = loaded(adminPage);

// Unpublished pairings stay secret, organizers included, and drafts are hidden on every public page.
type User = NonNullable<App.Locals['user']>;
const as = (id: string, isOrganizer = false): User => ({
	id,
	displayName: id,
	avatar: null,
	isOrganizer
});
const ORG = as('org', true);
const VIEWERS = [
	['logged out', null],
	['a player', as('p1')],
	['an organizer', ORG]
] as const;

function event(params: Record<string, string>, user: User | null, query = '') {
	// Season page drafts re-check the role, which needs a real session row.
	const session = user && {
		id: validateSession(
			createSession(user.id, 'tok', user.isOrganizer, new Date(Date.now() + 60_000))
		)!.session.id,
		accessToken: 'tok'
	};
	return {
		params,
		locals: { user, session },
		url: new URL(`http://localhost/x?${query}`)
	} as never;
}
const notFound = async (p: () => unknown) => {
	try {
		await p();
	} catch (e) {
		return isHttpError(e) && e.status === 404;
	}
	return false;
};

let published: number;
let hidden: number[];

// One group of three in play, one round a week, long started: only round 1 is published.
beforeEach(() => {
	seedPlayers(3);
	db.insert(players)
		.values([
			{ id: 'org', displayName: 'org' },
			{ id: 'org2', displayName: 'org2' }
		])
		.run();
	const s = seedSeason({
		status: 'play',
		roundsPerWeek: 1,
		publishedRound: 1,
		startDate: '2026-01-05'
	});
	seedEntries(s.id, ['p1', 'p2', 'p3'], 1);
	const at = (round: number, p1Id: string, p2Id: string) =>
		seedMatch({ seasonId: s.id, group: 1, round, p1Id, p2Id }).id;
	published = at(1, 'p1', 'p2');
	hidden = [at(2, 'p1', 'p3'), at(3, 'p2', 'p3')];

	const draft = seedSeason({ slug: 'd', status: 'draft', publishedRound: 1 });
	seedEntries(draft.id, ['p1', 'p2'], 1);
	seedMatch({ seasonId: draft.id, group: 1, round: 1, p1Id: 'p1', p2Id: 'p2' });
});

describe.each(VIEWERS)('unpublished rounds, viewed %s', (_, user) => {
	it('schedule: no week shows them, asked for or not', async () => {
		const ids = new Set<number>();
		for (const query of ['', 'week=1', 'week=2', 'week=3', 'week=99']) {
			const d = await scheduleLoad(event({ slug: 's1' }, user, query));
			for (const c of [...d.overdue, ...d.sections.flatMap((s: { cards: Card[] }) => s.cards)])
				ids.add(c.id);
		}
		expect([...ids]).toEqual([published]);
	});

	it('season player pages list only published matches', async () => {
		const ids = async (id: string) =>
			(await playerLoad(event({ slug: 's1', id }, user))).matches.map((c: Card) => c.id);
		expect(await ids('p1')).toEqual([published]);
		expect(await ids('p3')).toEqual([]);
	});
});

it('a season player page lists its matches newest round first, early ones to their players only', async () => {
	// p3's holiday covers week 3, unlocking p2 vs p3.
	const season = db.select().from(seasons).where(eq(seasons.slug, 's1')).get()!;
	seedHoliday({
		seasonId: season.id,
		playerId: 'p3',
		from: '2026-01-19',
		to: '2026-01-21',
		status: 'approved'
	});
	const ids = async (user: User | null) =>
		(await playerLoad(event({ slug: 's1', id: 'p2' }, user))).matches.map((c: Card) => [
			c.id,
			c.early
		]);
	for (const user of [as('p2'), as('p3')])
		expect(await ids(user)).toEqual([
			[hidden[1], true],
			[published, false]
		]);
	for (const user of [null, as('p1'), ORG]) expect(await ids(user)).toEqual([[published, false]]);

	db.update(seasons).set({ publishedRound: 3 }).where(eq(seasons.id, season.id)).run();
	const p3 = await playerLoad(event({ slug: 's1', id: 'p3' }, null));
	expect(p3.matches.map((c: Card) => c.id)).toEqual([hidden[1], hidden[0]]);
});

// Holiday mode reports a match before its round is published: nothing public counts it until then.
describe('an early result in an unpublished round', () => {
	beforeEach(() => {
		db.update(matches)
			.set({
				p1Games: 2,
				p2Games: 0,
				p1Legend: 'Jinx',
				p2Legend: 'Ahri',
				diceWinnerId: 'p1',
				reportedBy: 'p1',
				reportedAt: new Date()
			})
			.where(eq(matches.id, hidden[0]))
			.run();
	});
	const publish = () =>
		db.update(seasons).set({ publishedRound: 2 }).where(eq(seasons.slug, 's1')).run();
	const api = async (get: (e: never) => Response | Promise<Response>) =>
		(await get({ params: { slug: 's1' }, url: new URL('http://localhost/api') } as never)).json();

	it('counts nowhere, not even for its own players, until its round is published', async () => {
		for (const user of [null, as('p1'), as('p3')]) {
			const me = await playerLoad(event({ slug: 's1', id: 'p1' }, user));
			expect([me.row?.played, me.dice.of]).toEqual([0, 0]);
		}
		expect((await legendsLoad(event({ slug: 's1' }, null))).matches).toBe(0);
		expect((await careerLoad(event({ id: 'p1' }, null))).totals.played).toBe(0);
		const detail = await api(apiSeason);
		expect(detail.groups[0].standings.map((r: { played: number }) => r.played)).toEqual([0, 0, 0]);
		expect(await api(apiLegends)).toEqual([]);
		expect(leaderboard().find((r) => r.playerId === 'p1')!.played).toBe(0);

		publish();
		expect((await playerLoad(event({ slug: 's1', id: 'p1' }, null))).row?.played).toBe(1);
		expect((await legendsLoad(event({ slug: 's1' }, null))).matches).toBe(1);
		expect((await careerLoad(event({ id: 'p1' }, null))).totals.played).toBe(1);
		expect((await api(apiLegends)).length).toBe(2);
		expect(leaderboard().find((r) => r.playerId === 'p1')!.played).toBe(1);
	});

	it('organizers see it, labelled, on the audit log and admin players; others do not', async () => {
		const season = db.select().from(seasons).where(eq(seasons.slug, 's1')).get()!;
		db.insert(audit)
			.values({ seasonId: season.id, actorId: 'p1', matchId: hidden[0], action: 'report' })
			.run();
		const lines = async (user: User | null) =>
			(await auditLoad(event({ slug: 's1' }, user))).lines.map((l: { what: string }) => l.what);
		expect(await lines(null)).toEqual([]);
		expect(await lines(as('p1'))).toEqual([]);
		expect(await lines(ORG)).toEqual([expect.stringMatching(/^Early, not public/)]);

		const rows = (await adminPlayersLoad({ parent: async () => ({ season }) } as never)).entries;
		expect(
			rows.map((e: { early: number; record: { played: number } }) => [e.early, e.record.played])
		).toEqual([
			[1, 0],
			[0, 0],
			[1, 0]
		]);
	});

	it('the audit log never logs anyone out, even when Discord says the token is dead', async () => {
		vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
		expect((await auditLoad(event({ slug: 's1' }, ORG))).lines).toHaveLength(0);
		expect(db.select().from(sessions).all()).toHaveLength(1);
	});

	it('organizers see an open flag on it, with its result', async () => {
		db.update(matches)
			.set({ flaggedBy: 'p2', flagReason: 'wrong' })
			.where(eq(matches.id, hidden[0]))
			.run();
		const season = db.select().from(seasons).where(eq(seasons.slug, 's1')).get()!;
		const { flags } = await adminLoad({ parent: async () => ({ season }) } as never);
		expect(flags.map((f: { id: number; reported: boolean }) => [f.id, f.reported])).toEqual([
			[hidden[0], true]
		]);
	});
});

describe('season page', () => {
	it("shows a player only this week's published matches", async () => {
		const d = await seasonLoad(event({ slug: 's1' }, as('p3')));
		expect(d.myWeek).toEqual([]);
		expect(d.signedUp).toBe(true);
		const mine = await seasonLoad(event({ slug: 's1' }, as('p1')));
		expect(mine.myWeek.map((c: Card) => c.id)).toEqual([published]);
	});

	it('never sends signup times to the public', async () => {
		const d = await seasonLoad(event({ slug: 's1' }, null));
		expect(d.entries.length).toBeGreaterThan(0);
		for (const e of d.entries) expect(e).not.toHaveProperty('joinedAt');
	});

	it('hides a draft from visitors and players', async () => {
		expect(await notFound(() => seasonLoad(event({ slug: 'd' }, null)))).toBe(true);
		expect(await notFound(() => seasonLoad(event({ slug: 'd' }, as('p1'))))).toBe(true);
	});

	it('previews a draft only once Discord confirms the organizer role', async () => {
		const member = (roles: string[]) =>
			vi.stubGlobal('fetch', async () =>
				Response.json({ user: { id: 'org' }, nick: null, avatar: null, roles })
			);
		member([ORGANIZER_ROLE_ID]);
		expect((await seasonLoad(event({ slug: 'd' }, ORG))).season.slug).toBe('d');
		member([]);
		expect(await notFound(() => seasonLoad(event({ slug: 'd' }, as('org2', true))))).toBe(true);
	});
});

describe('drafts on public sub-pages', () => {
	it.each(VIEWERS)('are 404 for %s', async (_, user) => {
		expect(await notFound(() => scheduleLoad(event({ slug: 'd' }, user)))).toBe(true);
		expect(await notFound(() => legendsLoad(event({ slug: 'd' }, user)))).toBe(true);
		expect(await notFound(() => playerLoad(event({ slug: 'd', id: 'p1' }, user)))).toBe(true);
	});

	it('are left out of the career page', async () => {
		const d = await careerLoad(event({ id: 'p1' }, null));
		expect(d.history.map((h: { slug: string }) => h.slug)).toEqual(['s1']);
		expect(await notFound(() => careerLoad(event({ id: 'org' }, null)))).toBe(true);
	});

	it('career page carries achievements', async () => {
		db.insert(playerAchievements)
			.values({ playerId: 'p1', achievementId: 'champion', unlockedAt: new Date(), seasonId: null })
			.run();
		const d = await careerLoad(event({ id: 'p1' }, null));
		expect(d.achievements.earned).toBe(1);
		expect(
			d.achievements.ones.find((t: { id: string }) => t.id === 'champion').earned
		).not.toBeNull();
	});
});

describe('admin players', () => {
	it('lists signups in signup order until the schedule exists', async () => {
		const s = seedSeason({ slug: 'sp', status: 'signup' });
		seedEntries(s.id, ['p1', 'p2', 'p3']);
		for (const [id, at] of [
			['p3', 100],
			['p1', 200],
			['p2', 300]
		] as const)
			db.update(entries)
				.set({ createdAt: new Date(at * 1000) })
				.where(and(eq(entries.seasonId, s.id), eq(entries.playerId, id)))
				.run();
		const ids = async () => {
			const season = db.select().from(seasons).where(eq(seasons.id, s.id)).get()!;
			const data = await adminPlayersLoad({ parent: async () => ({ season }) } as never);
			return data.entries.map((e: { playerId: string }) => e.playerId);
		};
		expect(await ids()).toEqual(['p3', 'p1', 'p2']);
		db.update(seasons).set({ status: 'play' }).where(eq(seasons.id, s.id)).run();
		expect(await ids()).toEqual(['p1', 'p2', 'p3']);
	});
});
