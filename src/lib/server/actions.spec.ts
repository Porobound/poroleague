import { isHttpError, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions as matchActions } from '../../routes/seasons/[slug]/matches/[id]/+page.server.ts';
import { actions as adminActions } from '../../routes/seasons/[slug]/admin/+page.server.ts';
import { actions as seasonActions } from '../../routes/seasons/[slug]/admin/season/+page.server.ts';
import { actions as groupActions } from '../../routes/seasons/[slug]/admin/groups/+page.server.ts';
import { actions as playerActions } from '../../routes/seasons/[slug]/admin/players/+page.server.ts';
import { actions as createActions } from '../../routes/admin/+page.server.ts';
import { actions as seasonPageActions } from '../../routes/seasons/[slug]/+page.server.ts';
import { actions as playerPageActions } from '../../routes/seasons/[slug]/players/[id]/+page.server.ts';
import { db } from '#lib/server/db/index.ts';
import { entries, matches, players, seasons } from '#lib/server/db/schema.ts';
import { flagMatch, saveReport } from '#lib/server/matches.ts';
import { erasePlayer } from '#lib/server/players.ts';
import { groupStandings, seasonEntries, type Season } from '#lib/server/seasons.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

// The Discord re-check has its own tests (auth.spec.ts); here the session's role is trusted.
vi.mock('#lib/server/auth.ts', async (original) => {
	const { redirect } = await import('@sveltejs/kit');
	const organizer = async ({ locals }: { locals: App.Locals }) => {
		if (!locals.user?.isOrganizer) redirect(303, '/login/not-organizer');
		return locals.user;
	};
	return {
		...(await original<typeof import('#lib/server/auth.ts')>()),
		organizerAction: organizer,
		organizerPage: organizer
	};
});

type User = NonNullable<App.Locals['user']>;
const as = (id: string, isOrganizer = false): User => ({
	id,
	displayName: id,
	avatar: null,
	isOrganizer
});
const ORG = as('org', true);

// A fake RequestEvent: just what the actions read.
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
const status = async (p: unknown) => ((await outcome(p)).returned as { status?: number })?.status;

const result = { p1Games: '2', p2Games: '1', p1Legend: 'Jinx', p2Legend: 'Viktor' };
const get = (id: number) => db.select().from(matches).where(eq(matches.id, id)).get()!;

let season: Season;
let m1: number, m2: number, m3: number;

// Group of three in play: rounds 1–2 published, round 3 not.
beforeEach(() => {
	seedPlayers(3);
	db.insert(players).values({ id: 'org', displayName: 'org' }).run();
	season = seedSeason({ status: 'play', roundsPerWeek: 2, publishedRound: 2 });
	seedEntries(season.id, ['p1', 'p2', 'p3'], 1);
	const at = (round: number, p1Id: string, p2Id: string) =>
		seedMatch({ seasonId: season.id, group: 1, round, p1Id, p2Id }).id;
	[m1, m2, m3] = [at(1, 'p1', 'p2'), at(2, 'p1', 'p3'), at(3, 'p2', 'p3')];
});

const setSeason = (values: Partial<Season>) =>
	db.update(seasons).set(values).where(eq(seasons.id, season.id)).run();

describe('player report', () => {
	const report = (
		id: number,
		user: User | null,
		form: Record<string, string> = { ...result, dice: 'p1' }
	) => matchActions.report!(event({ slug: 's1', id: String(id) }, user, form));

	it('saves a player’s own report once', async () => {
		expect((await outcome(report(m1, as('p2')))).returned).toMatchObject({
			message: expect.any(String)
		});
		expect(get(m1)).toMatchObject({ p1Games: 2, reportedBy: 'p2' });
		expect(await status(report(m1, as('p1')))).toBe(409);
	});

	it('refuses players outside the match', async () => {
		expect(await status(report(m1, as('p3')))).toBe(409);
		expect(await status(report(m1, ORG))).toBe(409);
	});

	it('rejects a bad form and keeps what was typed', async () => {
		const r = (await outcome(report(m1, as('p1'), { ...result, p1Games: '3', dice: 'p3' })))
			.returned;
		expect(r).toMatchObject({
			status: 400,
			data: { errors: { score: expect.any(String), dice: expect.any(String) } }
		});
		expect(get(m1).reportedBy).toBeNull();
	});

	it('hides unpublished rounds, organizers included', async () => {
		expect((await outcome(report(m3, as('p2')))).error).toBe(404);
		expect((await outcome(report(m3, ORG))).error).toBe(404);
	});

	it('sends a logged-out visitor to login', async () => {
		expect((await outcome(report(m1, null))).redirect).toMatch(/^\/auth\/login/);
	});

	it('refuses reports past the deadline and on void matches', async () => {
		setSeason({ deadline: '2020-01-01' });
		expect(await status(report(m1, as('p1')))).toBe(409);
		setSeason({ deadline: null });
		db.update(entries).set({ dropped: true }).where(eq(entries.playerId, 'p2')).run();
		expect(await status(report(m1, as('p1')))).toBe(409);
	});
});

describe('player flag', () => {
	const flag = (id: number, user: User, reason: string) =>
		matchActions.flag!(event({ slug: 's1', id: String(id) }, user, { reason }));
	const reported = () =>
		saveReport(get(m1), 'p1', {
			p1Games: 2,
			p2Games: 1,
			p1Legend: 'Jinx',
			p2Legend: 'Viktor',
			diceWinnerId: 'p1'
		});

	it('needs a reason of up to 500 characters', async () => {
		reported();
		expect(await status(flag(m1, as('p2'), '   '))).toBe(400);
		expect(await status(flag(m1, as('p2'), 'x'.repeat(501)))).toBe(400);
		expect(get(m1).flaggedBy).toBeNull();
		expect((await outcome(flag(m1, as('p2'), 'x'.repeat(500)))).returned).toMatchObject({
			message: expect.any(String)
		});
	});

	it('flags a reported match once, and only for its players', async () => {
		expect(await status(flag(m1, as('p2'), 'not reported yet'))).toBe(409);
		reported();
		expect(await status(flag(m1, as('p3'), 'not mine'))).toBe(409);
		await flag(m1, as('p2'), 'wrong score');
		expect(get(m1)).toMatchObject({ flaggedBy: 'p2', flagReason: 'wrong score' });
		expect(await status(flag(m1, as('p1'), 'again'))).toBe(409);
	});
});

describe('organizer edit and keep', () => {
	const edit = (matchId: number | string) =>
		adminActions.edit!(
			event({ slug: 's1' }, ORG, { ...result, dice: 'p2', matchId: String(matchId) })
		);
	const keep = (matchId: number) =>
		adminActions.keep!(event({ slug: 's1' }, ORG, { matchId: String(matchId) }));

	it('enters a result on a published match', async () => {
		expect((await outcome(edit(m1))).returned).toMatchObject({
			message: 'Result saved and logged.'
		});
		expect(get(m1)).toMatchObject({ diceWinnerId: 'p2', reportedBy: 'org' });
	});

	it('refuses outside play, on void matches and on unpublished rounds', async () => {
		setSeason({ status: 'finished' });
		expect(await status(edit(m1))).toBe(409);
		setSeason({ status: 'play' });
		expect(await status(edit(m3))).toBe(409);
		db.update(entries).set({ dropped: true }).where(eq(entries.playerId, 'p2')).run();
		expect(await status(edit(m1))).toBe(409);
		expect(get(m1).reportedBy).toBeNull();
	});

	it('404s on a match from another season or a junk id', async () => {
		const other = seedSeason({ slug: 's2', status: 'play' });
		const foreign = seedMatch({ seasonId: other.id, round: 1, p1Id: 'p1', p2Id: 'p2' }).id;
		expect((await outcome(edit(foreign))).error).toBe(404);
		expect((await outcome(edit('abc'))).error).toBe(404);
	});

	it('keep needs an open flag', async () => {
		expect(await status(keep(m1))).toBe(409);
		saveReport(get(m1), 'p1', {
			p1Games: 2,
			p2Games: 1,
			p1Legend: 'Jinx',
			p2Legend: 'Viktor',
			diceWinnerId: 'p1'
		});
		flagMatch(get(m1), 'p2', 'wrong');
		expect((await outcome(keep(m1))).returned).toMatchObject({ message: expect.any(String) });
		expect(await status(keep(m1))).toBe(409);
	});
});

describe('publish', () => {
	it('a double submit can’t publish the week after', async () => {
		const publish = () => adminActions.publish!(event({ slug: 's1' }, ORG, { week: '2' }));
		expect((await outcome(publish())).returned).toMatchObject({ message: 'Week 2 published.' });
		expect(db.select().from(seasons).get()!.publishedRound).toBe(3);
		expect(await status(publish())).toBe(409);
	});
});

describe('season end', () => {
	const tiebreak = (order: string[]) =>
		seasonActions.tiebreak!(event({ slug: 's1' }, ORG, { order: order.join(',') }));
	const finalize = () => seasonActions.finalize!(event({ slug: 's1' }, ORG));

	it('settles ties only at the end of the season', async () => {
		expect(await status(tiebreak(['p1', 'p2', 'p3']))).toBe(409);
	});

	it('takes only the exact tied cluster, then finalizes', async () => {
		// Past the deadline nobody played: all three tie on zero.
		setSeason({ deadline: '2020-01-01', publishedRound: 3 });
		const [g] = groupStandings(db.select().from(seasons).get()!, seasonEntries(season.id));
		expect(new Set(g.rows.map((r) => r.tie)).size).toBe(1);

		expect(await status(finalize())).toBe(409);
		expect(await status(tiebreak(['p1', 'p1', 'p2']))).toBe(400);
		expect(await status(tiebreak(['p1', 'p2']))).toBe(400);
		expect(await status(tiebreak(['p1', 'p2', 'p3', 'org']))).toBe(400);
		expect((await outcome(tiebreak(['p3', 'p1', 'p2']))).returned).toMatchObject({
			message: 'Tiebreak order saved.'
		});
		expect((await outcome(finalize())).returned).toMatchObject({ message: expect.any(String) });
		expect(db.select().from(seasons).get()!.status).toBe('finished');
	});

	it('won’t finalize with an open flag', async () => {
		setSeason({ deadline: '2020-01-01' });
		saveReport(get(m1), 'p1', {
			p1Games: 2,
			p2Games: 0,
			p1Legend: 'Jinx',
			p2Legend: 'Viktor',
			diceWinnerId: 'p1'
		});
		flagMatch(get(m1), 'p2', 'wrong');
		expect(await status(finalize())).toBe(409);
	});
});

describe('season delete and signup', () => {
	const del = (confirmSlug?: string) =>
		seasonActions.delete!(event({ slug: 's1' }, ORG, confirmSlug ? { confirmSlug } : {}));

	it('needs the typed slug once there are matches', async () => {
		expect(await status(del())).toBe(400);
		expect(await status(del('wrong'))).toBe(400);
		expect((await outcome(del('s1'))).redirect).toBe('/admin');
		expect(db.select().from(seasons).get()).toMatchObject({
			deletedBy: 'org',
			slug: `s1~deleted-${season.id}`
		});
	});

	it('deletes a draft without confirmation', async () => {
		seedSeason({ slug: 'd', status: 'draft' });
		const r = await outcome(seasonActions.delete!(event({ slug: 'd' }, ORG)));
		expect(r.redirect).toBe('/admin');
	});

	it('opens signup only while no other season is running', async () => {
		seedSeason({ slug: 'd', status: 'draft' });
		const open = () => seasonActions.openSignup!(event({ slug: 'd' }, ORG));
		expect(await status(open())).toBe(409);
		setSeason({ status: 'finished' });
		expect((await outcome(open())).returned).toMatchObject({ message: expect.any(String) });
		expect(await status(open())).toBe(409);
	});
});

describe('groups', () => {
	const lock = () => groupActions.lock!(event({ slug: 's1' }, ORG));

	it('only act during the groups phase', async () => {
		expect(await status(lock())).toBe(409);
		expect(await status(groupActions.redraw!(event({ slug: 's1' }, ORG)))).toBe(409);
	});

	it('lock needs at least 2 players in every group', async () => {
		db.delete(matches).run();
		setSeason({ status: 'groups' });
		db.update(entries).set({ group: 2 }).where(eq(entries.playerId, 'p3')).run();
		expect(await status(lock())).toBe(400);
		db.update(entries).set({ group: 1 }).run();
		expect((await outcome(lock())).redirect).toBe('/seasons/s1/admin/groups');
		expect(db.select().from(seasons).get()!.status).toBe('play');
		expect(db.select().from(matches).all().length).toBe(3);
	});
});

describe('organizer actions', () => {
	const all = Object.entries({
		admin: adminActions,
		season: seasonActions,
		groups: groupActions,
		players: playerActions,
		create: createActions
	}).flatMap(([page, actions]) =>
		Object.entries(actions).map(([name, action]) => [`${page}.${name}`, action!] as const)
	);

	it.each(all)('%s turns away a plain player and changes nothing', async (_, action) => {
		const before = [
			db.select().from(seasons).all(),
			db.select().from(matches).all(),
			db.select().from(entries).all()
		];
		const form = {
			matchId: String(m1),
			playerId: 'p2',
			week: '2',
			order: 'p1,p2,p3',
			confirmSlug: 's1',
			slug: 'x',
			name: 'X',
			group: '1',
			...result,
			dice: 'p1'
		};
		expect((await outcome(action(event({ slug: 's1' }, as('p1'), form)))).redirect).toBe(
			'/login/not-organizer'
		);
		expect([
			db.select().from(seasons).all(),
			db.select().from(matches).all(),
			db.select().from(entries).all()
		]).toEqual(before);
	});
});

describe('player signup', () => {
	const entered = (id: string) =>
		db
			.select()
			.from(entries)
			.all()
			.filter((e) => e.playerId === id).length;
	const join = (user: User | null, slug = 's1') => seasonPageActions.join!(event({ slug }, user));
	const withdraw = (user: User | null, slug = 's1') =>
		seasonPageActions.withdraw!(event({ slug }, user));

	it('joins and withdraws during signup, safely twice', async () => {
		setSeason({ status: 'signup' });
		db.insert(players).values({ id: 'p4', displayName: 'p4' }).run();
		await join(as('p4'));
		await join(as('p4'));
		expect(entered('p4')).toBe(1);
		await withdraw(as('p4'));
		expect((await outcome(withdraw(as('p4')))).returned).toMatchObject({
			message: expect.any(String)
		});
		expect(entered('p4')).toBe(0);
	});

	it('is closed outside signup', async () => {
		expect(await status(join(as('p4')))).toBe(409);
		expect(await status(withdraw(as('p1')))).toBe(409);
		expect(entered('p1')).toBe(1);
	});

	it('needs a login, and drafts stay hidden', async () => {
		setSeason({ status: 'signup' });
		expect((await outcome(join(null))).redirect).toMatch(/^\/auth\/login/);
		seedSeason({ slug: 'd', status: 'draft' });
		expect((await outcome(join(as('p1'), 'd'))).error).toBe(404);
	});
});

describe('admin players', () => {
	const run = (name: 'remove' | 'drop' | 'cancelDrop', playerId: string) =>
		playerActions[name]!(event({ slug: 's1' }, ORG, { playerId }));
	const dropped = (id: string) =>
		db.select().from(entries).where(eq(entries.playerId, id)).get()?.dropped;

	it('remove only while signup is open', async () => {
		expect(await status(run('remove', 'p3'))).toBe(409);
		setSeason({ status: 'signup' });
		await run('remove', 'p3');
		expect(seasonEntries(season.id).map((e) => e.playerId)).toEqual(['p1', 'p2']);
	});

	it('drop once, only entered players, only in play', async () => {
		expect(await status(run('drop', 'org'))).toBe(409);
		await run('drop', 'p3');
		expect(dropped('p3')).toBe(true);
		expect(await status(run('drop', 'p3'))).toBe(409);
		setSeason({ status: 'finished' });
		expect(await status(run('drop', 'p2'))).toBe(409);
		expect(dropped('p2')).toBe(false);
	});

	it('cancelDrop only a dropped player, only in play', async () => {
		expect(await status(run('cancelDrop', 'p3'))).toBe(409);
		await run('drop', 'p3');
		setSeason({ status: 'finished' });
		expect(await status(run('cancelDrop', 'p3'))).toBe(409);
		setSeason({ status: 'play' });
		await run('cancelDrop', 'p3');
		expect(dropped('p3')).toBe(false);
	});

	it('never brings back an erased player', async () => {
		erasePlayer('p3', 'org');
		expect(dropped('p3')).toBe(true);
		expect((await outcome(run('cancelDrop', 'p3'))).returned).toMatchObject({
			status: 409,
			data: { message: 'An erased player can’t come back to the season.' }
		});
		expect(dropped('p3')).toBe(true);
	});
});

describe('erase player', () => {
	const erase = (id: string, user: User | null, confirm: string) =>
		playerPageActions.erase!(event({ slug: 's1', id }, user, { confirm }));
	const p2 = () => db.select().from(players).where(eq(players.id, 'p2')).get()!;

	it('is for organizers only', async () => {
		expect((await outcome(erase('p2', as('p1'), 'Player 2'))).redirect).toBe(
			'/login/not-organizer'
		);
		expect(p2().erasedAt).toBeNull();
	});

	it('needs the player’s name typed in', async () => {
		expect(await status(erase('p2', ORG, 'player 2'))).toBe(400);
		expect(p2().erasedAt).toBeNull();
	});

	it('erases once, then refuses', async () => {
		expect((await outcome(erase('p2', ORG, ' Player 2 '))).returned).toEqual({
			message: expect.stringMatching(
				/^Player erased\. Their results now show as Former player [0-9a-f]{4}\.$/
			)
		});
		expect(p2()).toMatchObject({
			displayName: expect.stringMatching(/^Former player /),
			discordId: null
		});
		expect(await status(erase('p2', ORG, p2().displayName))).toBe(409);
	});

	it('goes to the players list when erasing took them off the season', async () => {
		setSeason({ status: 'signup' });
		expect((await outcome(erase('p2', ORG, 'Player 2'))).redirect).toBe(
			'/seasons/s1/admin/players'
		);
		expect(seasonEntries(season.id).map((e) => e.playerId)).toEqual(['p1', 'p3']);
	});

	it('404s for someone not in the season', async () => {
		expect((await outcome(erase('org', ORG, 'org'))).error).toBe(404);
	});
});
