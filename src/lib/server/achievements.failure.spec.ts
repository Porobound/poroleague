import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { init } from '../../hooks.server.ts';
import { actions as matchActions } from '../../routes/seasons/[slug]/matches/[id]/+page.server.ts';
import { db } from '#lib/server/db/index.ts';
import { matches, playerAchievements } from '#lib/server/db/schema.ts';
import { finalizeSeason, publishWeek } from '#lib/server/seasons.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

// Every check throws, as a bug in award code would.
vi.mock('#lib/league/achievements.ts', async (o) => ({
	...(await o<typeof import('#lib/league/achievements.ts')>()),
	evaluate: () => {
		throw new Error('award bug');
	}
}));
const hooks = vi.hoisted(() => ({ postResult: vi.fn() }));
vi.mock('#lib/server/webhooks.ts', async (o) => ({
	...(await o<typeof import('#lib/server/webhooks.ts')>()),
	...hooks
}));

let logged: MockInstance<typeof console.error>;
beforeEach(() => {
	logged = vi.spyOn(console, 'error').mockImplementation(() => {});
	hooks.postResult.mockClear();
});

const user = { id: 'p1', displayName: 'Player 1', avatar: null, isOrganizer: false };
function event(params: Record<string, string>, form: Record<string, string>) {
	const url = new URL(`http://localhost/seasons/${params.slug}/matches/${params.id}`);
	const body = new FormData();
	for (const [k, v] of Object.entries(form)) body.set(k, v);
	return {
		params,
		url,
		locals: { user, session: { id: 'sess', accessToken: 'tok' } },
		request: new Request(url, { method: 'POST', body })
	} as never;
}

describe('a failing award', () => {
	it('still saves and posts the report, and logs the error', async () => {
		seedPlayers(2);
		const s = seedSeason({ status: 'play', publishedRound: 1 });
		seedEntries(s.id, ['p1', 'p2'], 1);
		const m = seedMatch({ seasonId: s.id, group: 1, round: 1, p1Id: 'p1', p2Id: 'p2' });
		const form = { game1: '1', game2: '1', p1Legend: 'Ahri', p2Legend: 'Annie', dice: 'p1' };
		const res = await matchActions.report!(event({ slug: 's1', id: String(m.id) }, form));
		expect(res).toMatchObject({ message: expect.stringContaining('Result saved') });
		expect(db.select().from(matches).where(eq(matches.id, m.id)).get()).toMatchObject({
			reportedBy: 'p1',
			p1Games: 2
		});
		expect(hooks.postResult).toHaveBeenCalledOnce();
		expect(db.select().from(playerAchievements).all()).toEqual([]);
		expect(logged).toHaveBeenCalledWith('Achievement award failed (players):', expect.any(Error));
	});

	it('never fails a season write or the server start', async () => {
		seedPlayers(2);
		const s = seedSeason({ status: 'play', publishedRound: 0 });
		seedEntries(s.id, ['p1', 'p2'], 1);
		expect(() => publishWeek(s.id, 1, [1, 2], 'p1')).not.toThrow();
		expect(() => finalizeSeason(s.id, 'p1', false)).not.toThrow();
		await expect(Promise.resolve(init())).resolves.toBeUndefined();
		expect(logged.mock.calls.map((c) => c[0])).toEqual([
			`Achievement award failed (season ${s.id}):`,
			`Achievement award failed (season ${s.id}):`,
			'Achievement award failed (backfill):'
		]);
	});
});
