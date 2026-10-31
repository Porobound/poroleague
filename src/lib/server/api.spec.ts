import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as seasonGet } from '../../routes/api/v1/seasons/[slug]/+server.ts';
import { GET as seasonsGet } from '../../routes/api/v1/seasons/+server.ts';
import { GET as unknownGet } from '../../routes/api/v1/[...rest]/+server.ts';
import { GET as legendsGet } from '../../routes/api/v1/seasons/[slug]/legends/+server.ts';
import { GET as matchesGet } from '../../routes/api/v1/seasons/[slug]/matches/+server.ts';
import { GET as topCutGet } from '../../routes/api/v1/seasons/[slug]/top-cut/+server.ts';
import { flagMatch, keepResult, saveReport } from '#lib/server/matches.ts';
import { cutState, publishCut } from '#lib/server/topCut.ts';
import { db } from '#lib/server/db/index.ts';
import { matches, players, seasons } from '#lib/server/db/schema.ts';
import { erasePlayer } from '#lib/server/players.ts';
import { deleteSeason, dropPlayer } from '#lib/server/seasons.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

const call = async (get: (e: never) => Response | Promise<Response>, params = {}) => {
	const res = await get({ params } as never);
	return { status: res.status, body: await res.json() };
};
const season = (slug: string) => call(seasonGet, { slug });

describe('GET /api/v1/seasons', () => {
	it('lists live non-draft seasons, newest first, with a fixed shape', async () => {
		seedSeason({ slug: 'old', name: 'Old', status: 'finished', startDate: '2026-01-05' });
		seedSeason({ slug: 'draft', name: 'Draft' });
		const gone = seedSeason({ slug: 'gone', name: 'Gone', status: 'finished' });
		seedPlayers(1);
		deleteSeason(gone, 'p1');
		seedSeason({ slug: 'new', name: 'New', status: 'signup', deadline: '2026-12-20' });

		const { status, body } = await call(seasonsGet);
		expect(status).toBe(200);
		expect(body).toEqual([
			{ slug: 'new', name: 'New', status: 'signup', startDate: null, deadline: '2026-12-20' },
			{ slug: 'old', name: 'Old', status: 'finished', startDate: '2026-01-05', deadline: null }
		]);
	});
});

describe('GET /api/v1/seasons/:slug', () => {
	it('404s drafts, deleted and unknown seasons', async () => {
		seedPlayers(1);
		seedSeason({ slug: 'draft' });
		deleteSeason(seedSeason({ slug: 'gone', status: 'play' }), 'p1');
		for (const slug of ['draft', 'gone', 'nope'])
			expect(await season(slug)).toEqual({ status: 404, body: { error: 'Season not found' } });
	});

	it('has no groups before the schedule exists', async () => {
		seedPlayers(2);
		const s = seedSeason({ status: 'signup' });
		seedEntries(s.id, ['p1', 'p2']);
		const { body } = await season('s1');
		expect(body.groups).toEqual([]);
		expect(body.players).toEqual([
			{ id: 'p1', name: 'Player 1', former: false, group: null, dropped: false },
			{ id: 'p2', name: 'Player 2', former: false, group: null, dropped: false }
		]);
	});

	it('hides a draw that is not locked yet', async () => {
		seedPlayers(2);
		const s = seedSeason({ status: 'groups' });
		seedEntries(s.id, ['p1', 'p2'], 1);
		const { body } = await season('s1');
		expect(body.groups).toEqual([]);
		expect(body.players.map((p: { group: number | null }) => p.group)).toEqual([null, null]);
	});

	describe('in play', () => {
		beforeEach(() => {
			seedPlayers(4);
			db.insert(players).values({ id: 'org', displayName: 'Org' }).run();
			const s = seedSeason({ status: 'play', publishedRound: 3, topCutSize: 2 });
			seedEntries(s.id, ['p1', 'p2', 'p3', 'p4'], 1);
			const play = (round: number, p1Id: string, p2Id: string, p1Games: number, p2Games: number) =>
				seedMatch({ seasonId: s.id, group: 1, round, p1Id, p2Id, p1Games, p2Games });
			play(1, 'p1', 'p2', 2, 0);
			play(1, 'p3', 'p4', 1, 2);
			play(2, 'p2', 'p4', 2, 1);
			dropPlayer(s.id, 'p3', 'org');
		});

		it('ranks the group like the standings page', async () => {
			const { status, body } = await season('s1');
			expect(status).toBe(200);
			expect(body).toMatchObject({
				slug: 's1',
				status: 'play',
				roundsPerWeek: 2,
				publishedRound: 3,
				topCutSize: 2,
				topCutDate: null
			});
			expect(body.groups).toHaveLength(1);
			const [g] = body.groups;
			expect(g.group).toBe(1);
			expect(g.name).toBe('Group A');
			// p1 and p2 are level on points; p1 won the head-to-head.
			expect(g.standings.map((r: { player: { id: string } }) => r.player.id)).toEqual([
				'p1',
				'p2',
				'p4'
			]);
			expect(g.standings[1]).toEqual({
				rank: 2,
				player: { id: 'p2', name: 'Player 2', former: false },
				played: 2,
				wins: 1,
				draws: 0,
				losses: 1,
				points: 3,
				gameWins: 2,
				gameLosses: 3,
				gameWinPct: 0.4,
				unresolvedTie: false
			});
		});

		it('lists a dropped player but leaves them out of the standings', async () => {
			const { body } = await season('s1');
			expect(body.players.find((p: { id: string }) => p.id === 'p3')).toEqual({
				id: 'p3',
				name: 'Player 3',
				former: false,
				group: 1,
				dropped: true
			});
			expect(JSON.stringify(body.groups)).not.toContain('p3');
		});

		it('shows an erased player as former, and never avatars or Discord ids', async () => {
			db.update(players)
				.set({
					avatar: sql`'https://cdn.discordapp.com/avatars/' || ${players.id} || '0042/abc.png'`,
					discordId: sql`${players.id} || '0042'`
				})
				.run();
			erasePlayer('p4', 'org');
			const { body } = await season('s1');
			const p4 = body.players.find((p: { id: string }) => p.id === 'p4');
			expect(p4.former).toBe(true);
			expect(p4.name).toMatch(/^Former player [0-9a-f]{4}$/);
			const text = JSON.stringify(body);
			expect(text).not.toMatch(/avatar|discord|0042/i);
		});
	});
});

it('answers unknown API paths with JSON', async () => {
	expect(await call(unknownGet)).toEqual({ status: 404, body: { error: 'Not found' } });
});

type M = { id: number; round: number; stage: string; p1: { id: string }; p2: { id: string } };
const matchesOf = async () =>
	(await call(matchesGet, { slug: 's1' })).body as (M & Record<string, unknown>)[];

describe('GET /api/v1/seasons/:slug/matches', () => {
	const ids: Record<string, number> = {};
	// One group of four, one round a week, long started; rounds 1–2 of 3 published.
	beforeEach(() => {
		seedPlayers(4);
		db.insert(players).values({ id: 'org', displayName: 'Org' }).run();
		const s = seedSeason({
			status: 'play',
			roundsPerWeek: 1,
			publishedRound: 2,
			startDate: '2026-01-05'
		});
		seedEntries(s.id, ['p1', 'p2', 'p3', 'p4'], 1);
		const at = (key: string, round: number, p1Id: string, p2Id: string) =>
			(ids[key] = seedMatch({ seasonId: s.id, group: 1, round, p1Id, p2Id }).id);
		at('reported', 1, 'p1', 'p2');
		at('flagged', 1, 'p3', 'p4');
		at('open', 2, 'p1', 'p3');
		at('resolved', 2, 'p2', 'p4');
		at('hidden', 3, 'p1', 'p4');
		const m = (key: string) => db.select().from(matches).where(eq(matches.id, ids[key])).get()!;
		saveReport(m('reported'), 'p1', {
			games: '1D1',
			p1Games: 2,
			p2Games: 0,
			p1Legend: 'Jinx',
			p2Legend: 'Ahri',
			diceWinnerId: 'p2'
		});
		const plain = { games: null, p1Games: 2, p2Games: 1, p1Legend: 'Ahri', p2Legend: 'Annie' };
		saveReport(m('flagged'), 'p3', { ...plain, diceWinnerId: 'p3' });
		flagMatch(m('flagged'), 'p4', 'He conceded game two, so the score is wrong.');
		saveReport(m('resolved'), 'p2', { ...plain, diceWinnerId: 'p2' });
		flagMatch(m('resolved'), 'p4', 'Typo in the score.');
		keepResult(m('resolved'), 'org');
	});
	const find = async (key: string) => (await matchesOf()).find((x) => x.id === ids[key])!;

	// Regression guard for the spec rule: the API sees only published rounds.
	it('leaves out unpublished rounds', async () => {
		const ms = await matchesOf();
		expect(ms.map((x) => x.round)).toEqual([1, 1, 2, 2]);
		expect(ms.some((x) => x.id === ids.hidden)).toBe(false);
	});

	it('maps a reported result', async () => {
		const x = await find('reported');
		expect(x).toMatchObject({
			stage: 'group',
			group: 1,
			round: 1,
			week: 1,
			p1: { id: 'p1', name: 'Player 1', former: false },
			p2: { id: 'p2', name: 'Player 2', former: false },
			walkover: null,
			void: false,
			overdue: false,
			flag: null
		});
		expect(x.result).toMatchObject({
			p1Games: 2,
			p2Games: 0,
			games: ['1', 'D', '1'],
			p1Legend: 'Jinx',
			p2Legend: 'Ahri',
			diceWinner: 'p2'
		});
		expect(new Date((x.result as { reportedAt: string }).reportedAt).toISOString()).toBe(
			(x.result as { reportedAt: string }).reportedAt
		);
	});

	it('shows flag state but never the reason', async () => {
		expect((await find('flagged')).flag).toBe('open');
		expect((await find('resolved')).flag).toBe('resolved');
		expect(JSON.stringify(await matchesOf())).not.toMatch(/conceded|Typo/);
	});

	it('marks an unreported past-week match overdue, and void once a player drops', async () => {
		expect(await find('open')).toMatchObject({ result: null, overdue: true, void: false });
		dropPlayer(db.select().from(seasons).get()!.id, 'p3', 'org');
		expect(await find('open')).toMatchObject({ overdue: false, void: true });
	});

	it('404s a draft', async () => {
		db.update(seasons).set({ status: 'draft' }).run();
		expect(await call(matchesGet, { slug: 's1' })).toEqual({
			status: 404,
			body: { error: 'Season not found' }
		});
	});
});

describe('top cut', () => {
	let id: number;
	// Two groups of three, all played: A = p1 > p2 > p3, B = p4 > p5 > p6; top 2 per group.
	beforeEach(() => {
		seedPlayers(6);
		id = seedSeason({ status: 'topcut', topCutSize: 2 }).id;
		seedEntries(id, ['p1', 'p2', 'p3'], 1);
		seedEntries(id, ['p4', 'p5', 'p6'], 2);
		for (const [g, a, b, c] of [
			[1, 'p1', 'p2', 'p3'],
			[2, 'p4', 'p5', 'p6']
		] as const)
			for (const [x, y] of [
				[a, b],
				[a, c],
				[b, c]
			])
				seedMatch({
					seasonId: id,
					group: g,
					round: 1,
					p1Id: x,
					p2Id: y,
					p1Games: 2,
					p2Games: 0,
					reportedBy: x
				});
	});
	const season = () => db.select().from(seasons).where(eq(seasons.id, id)).get()!;
	const slot = (round: number, n: number) => cutState(season()).rounds[round - 1][n].match!;
	const won = (actor: string, m: { p1Id: string }) =>
		saveReport(m as never, actor, {
			games: null,
			p1Games: 2,
			p2Games: 0,
			p1Legend: 'Jinx',
			p2Legend: 'Viktor',
			diceWinnerId: m.p1Id
		});

	it('404s and keeps playoffs out of /matches until the bracket is published', async () => {
		expect(await call(topCutGet, { slug: 's1' })).toEqual({
			status: 404,
			body: { error: 'No top cut yet' }
		});
		expect((await matchesOf()).every((x) => x.stage === 'group')).toBe(true);
	});

	it('shows the bracket and its champion once published', async () => {
		publishCut(season(), null, 'p1');
		won('p1', slot(1, 0));
		won('p4', slot(1, 1));
		won('p1', slot(2, 0));

		const { status, body } = await call(topCutGet, { slug: 's1' });
		expect(status).toBe(200);
		expect(body.champion).toEqual({ id: 'p1', name: 'Player 1', former: false });
		expect(body.rounds.map((r: { name: string }) => r.name)).toEqual(['Semifinals', 'Final']);
		expect(body.rounds[1].slots).toEqual([
			{
				p1: { id: 'p1', name: 'Player 1', former: false },
				p2: { id: 'p4', name: 'Player 4', former: false },
				bye: false,
				winner: 'p1',
				matchId: slot(2, 0).id
			}
		]);
		const playoffs = (await matchesOf()).filter((x) => x.stage === 'playoff');
		expect(playoffs).toHaveLength(3);
		expect(playoffs.every((x) => x.week === null)).toBe(true);
	});
});

describe('GET /api/v1/seasons/:slug/legends', () => {
	beforeEach(() => {
		seedPlayers(5);
		db.insert(players).values({ id: 'org', displayName: 'Org' }).run();
		const s = seedSeason({ status: 'play', publishedRound: 9 });
		seedEntries(s.id, ['p1', 'p2', 'p3', 'p4', 'p5'], 1);
		const play = (
			round: number,
			p1Id: string,
			p2Id: string,
			l1: string,
			l2: string,
			g: [number, number]
		) =>
			seedMatch({
				seasonId: s.id,
				group: 1,
				round,
				p1Id,
				p2Id,
				p1Legend: l1,
				p2Legend: l2,
				p1Games: g[0],
				p2Games: g[1],
				reportedBy: p1Id
			});
		play(1, 'p1', 'p2', 'Jinx', 'Ahri', [2, 0]);
		play(1, 'p3', 'p4', 'Jinx', 'Jinx', [2, 1]); // mirror
		play(2, 'p1', 'p5', 'Annie', 'Darius', [2, 0]); // void: p5 drops
		for (let r = 3; r <= 7; r++) play(r, 'p1', 'p2', 'Ezreal', 'Ekko', [2, 1]);
		dropPlayer(s.id, 'p5', 'org');
	});
	const rows = async () =>
		(await call(legendsGet, { slug: 's1' })).body as Record<string, unknown>[];

	it('leaves out void matches and counts mirrors only as picks', async () => {
		const list = await rows();
		expect(list.map((r) => r.legend)).not.toContain('Darius');
		expect(list.find((r) => r.legend === 'Jinx')).toEqual({
			legend: 'Jinx',
			picks: 3,
			players: 3,
			mirrors: 2,
			wins: 1,
			draws: 0,
			losses: 0,
			gameWins: 2,
			gameLosses: 0,
			matchWinPct: null,
			gameWinPct: null
		});
	});

	it('rates a legend from 5 non-mirror matches, sorted by picks', async () => {
		const list = await rows();
		expect(list.map((r) => r.legend)).toEqual(['Ekko', 'Ezreal', 'Jinx', 'Ahri']);
		const ez = list.find((r) => r.legend === 'Ezreal')!;
		expect(ez.matchWinPct).toBe(1);
		expect(ez.gameWinPct).toBeCloseTo(10 / 15);
	});
});
