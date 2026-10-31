import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as seasonGet } from '../../routes/api/v1/seasons/[slug]/+server.ts';
import { GET as seasonsGet } from '../../routes/api/v1/seasons/+server.ts';
import { GET as unknownGet } from '../../routes/api/v1/[...rest]/+server.ts';
import { db } from '#lib/server/db/index.ts';
import { players } from '#lib/server/db/schema.ts';
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
