import { and, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Report } from '#lib/league/report.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, players, seasons, sessions } from '#lib/server/db/schema.ts';
import { adminRows, flagMatch, getMatch, matchPlayers, saveReport } from '#lib/server/matches.ts';
import { discordMentions, erasePlayer, leaderboard } from '#lib/server/players.ts';
import {
	deleteSeason,
	dropPlayer,
	groupStandings,
	seasonEntries,
	setTiebreaks,
	type Season
} from '#lib/server/seasons.ts';
import { createSession } from '#lib/server/session.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

describe('discordMentions', () => {
	it('mentions linked players by Discord id, others by escaped name', () => {
		db.insert(players)
			.values([
				{ id: 'a', discordId: '111', displayName: 'Aki' },
				{ id: 'b', displayName: 'Former_player 1' }
			])
			.run();
		const mention = discordMentions(['a', 'b']);
		expect([mention('a'), mention('b'), mention('zz')]).toEqual([
			'<@111>',
			'Former\\_player 1',
			'Unknown'
		]);
	});
});

describe('erasePlayer', () => {
	const ORG = 'org';
	let season: Season;
	let ms: number[];
	const result = (diceWinnerId: string): Report => ({
		games: '121',
		p1Games: 2,
		p2Games: 1,
		p1Legend: 'Ahri',
		p2Legend: 'Annie',
		diceWinnerId
	});
	const dump = () =>
		[players, sessions, seasons, entries, matches, audit]
			.map((t) => JSON.stringify(db.select().from(t).all()))
			.join('\n');
	const player = (id: string) => db.select().from(players).where(eq(players.id, id)).get()!;
	const stats = () =>
		groupStandings(season, seasonEntries(season.id)).map((g) =>
			g.rows.map(({ name: _, avatar: __, former: ___, ...r }) => r)
		);

	beforeEach(() => {
		seedPlayers(3);
		db.insert(players).values({ id: ORG, displayName: 'Org' }).run();
		db.update(players)
			.set({ discordId: 'd1', avatar: 'https://cdn/p1.png' })
			.where(eq(players.id, 'p1'))
			.run();
		season = seedSeason({ status: 'play', publishedRound: 3 });
		seedEntries(season.id, ['p1', 'p2', 'p3'], 1);
		ms = [
			['p1', 'p2'],
			['p1', 'p3'],
			['p2', 'p3']
		].map(
			([p1Id, p2Id], i) => seedMatch({ seasonId: season.id, group: 1, round: i + 1, p1Id, p2Id }).id
		);
		saveReport(getMatch(season.id, ms[0])!, 'p1', result('p1'));
		saveReport(getMatch(season.id, ms[1])!, 'p3', result('p3'));
		flagMatch(getMatch(season.id, ms[1])!, 'p1', 'Player 1 says p3 misreported');
		saveReport(getMatch(season.id, ms[2])!, 'p2', result('p2'));
		flagMatch(getMatch(season.id, ms[2])!, 'p3', 'p3 disagrees');
		setTiebreaks(season.id, ['p2', 'p1'], ORG);
		createSession('p1', 'tok1', false, new Date(Date.now() + 60_000));
		createSession('p2', 'tok2', false, new Date(Date.now() + 60_000));
	});

	const finish = () => {
		db.update(seasons).set({ status: 'finished' }).where(eq(seasons.id, season.id)).run();
		season = { ...season, status: 'finished' };
	};
	const entry = (seasonId: number) =>
		db
			.select()
			.from(entries)
			.where(and(eq(entries.seasonId, seasonId), eq(entries.playerId, 'p1')))
			.get();

	it('match players carry only what pages show, never the Discord id', () => {
		const [p1] = matchPlayers(getMatch(season.id, ms[0])!);
		expect(p1).toEqual({
			id: 'p1',
			displayName: 'Player 1',
			avatar: 'https://cdn/p1.png',
			former: false
		});
		erasePlayer('p1', ORG);
		expect(matchPlayers(getMatch(season.id, ms[0])!)[0]).toMatchObject({
			former: true,
			avatar: null
		});
	});

	it('keeps results and standings in a finished season', () => {
		finish();
		const before = stats();
		erasePlayer('p1', ORG);
		expect(stats()).toEqual(before);
		expect(
			db
				.select()
				.from(matches)
				.all()
				.map((m) => [m.p1Games, m.p2Games])
		).toEqual([
			[2, 1],
			[2, 1],
			[2, 1]
		]);
	});

	it('replaces the identity with a former player and a random suffix', () => {
		const { name } = erasePlayer('p1', ORG);
		expect(name).toMatch(/^Former player [0-9a-f]{4}$/);
		expect(player('p1')).toMatchObject({ displayName: name, avatar: null, discordId: null });
		expect(player('p1').erasedAt).toBeInstanceOf(Date);
		expect(erasePlayer('p2', ORG).name).not.toBe(name);
	});

	it('leaves no Discord id, name or avatar anywhere', () => {
		erasePlayer('p1', ORG);
		expect(dump()).not.toMatch(/"d1"|Player 1|p1\.png/);
	});

	it('logs them out, nobody else', () => {
		erasePlayer('p1', ORG);
		expect(
			db
				.select()
				.from(sessions)
				.all()
				.map((s) => s.playerId)
		).toEqual(['p2']);
	});

	it('clears only their flag reasons, in matches and the audit log', () => {
		erasePlayer('p1', ORG);
		expect(
			db
				.select()
				.from(matches)
				.all()
				.map((m) => m.flagReason)
		).toEqual([null, null, 'p3 disagrees']);
		const flags = db.select().from(audit).where(eq(audit.action, 'flag')).all();
		expect(flags.map((f) => [f.actorId, f.after])).toEqual([
			['p1', {}],
			['p3', { flagReason: 'p3 disagrees' }]
		]);
	});

	it('leaves an open flag without a reason for organizers', () => {
		finish();
		erasePlayer('p1', ORG);
		const [row] = adminRows(season, seasonEntries(season.id), [getMatch(season.id, ms[1])!]);
		expect(row.flag).toEqual({ by: expect.stringMatching(/^Former player /), reason: null });
	});

	it('drops them from a season in play: their matches are void', () => {
		expect(erasePlayer('p1', ORG).dropped).toEqual([{ name: 'Season 1', slug: 's1' }]);
		expect(entry(season.id)?.dropped).toBe(true);
		expect(
			db
				.select()
				.from(audit)
				.where(eq(audit.action, 'drop'))
				.all()
				.map((r) => [r.actorId, r.after])
		).toEqual([[ORG, { dropped: 'p1' }]]);
		expect(
			db
				.select({ t: entries.tiebreak })
				.from(entries)
				.all()
				.every((e) => e.t === null)
		).toBe(true);
		const p2 = groupStandings(season, seasonEntries(season.id))[0].rows.find(
			(r) => r.playerId === 'p2'
		)!;
		expect(p2.played).toBe(1);
	});

	it('in a published top cut: keeps the entry and asks organizers for a walkover', () => {
		db.update(seasons).set({ status: 'topcut' }).run();
		db.update(entries).set({ seed: 1, slot: 0 }).where(eq(entries.playerId, 'p1')).run();
		expect(erasePlayer('p1', ORG)).toMatchObject({
			dropped: [],
			walkovers: [{ name: 'Season 1', slug: 's1' }]
		});
		expect(entry(season.id)?.dropped).toBe(false);
	});

	it('keeps an earlier drop as it is', () => {
		dropPlayer(season.id, 'p1', ORG);
		expect(erasePlayer('p1', ORG).dropped).toEqual([]);
		expect(db.select().from(audit).where(eq(audit.action, 'drop')).all()).toHaveLength(1);
	});

	it('takes them off a season in signup or groups, with no erase row there', () => {
		const signup = seedSeason({ slug: 's2', status: 'signup' });
		const groups = seedSeason({ slug: 's3', status: 'groups' });
		seedEntries(signup.id, ['p1', 'p2']);
		seedEntries(groups.id, ['p1', 'p2'], 1);
		erasePlayer('p1', ORG);
		expect([entry(signup.id), entry(groups.id)]).toEqual([undefined, undefined]);
		expect(seasonEntries(signup.id).map((e) => e.playerId)).toEqual(['p2']);
		const erased = db.select().from(audit).where(eq(audit.action, 'erase')).all();
		expect(erased.map((r) => r.seasonId)).toEqual([season.id]);
	});

	it('leaves soft-deleted seasons alone: no drop, no audit rows, no notice', () => {
		deleteSeason(season, ORG);
		expect(erasePlayer('p1', ORG).dropped).toEqual([]);
		expect(entry(season.id)?.dropped).toBe(false);
		const rows = db
			.select()
			.from(audit)
			.all()
			.map((r) => r.action);
		expect(rows).not.toContain('drop');
		expect(rows).not.toContain('erase');
	});

	it('the restore runbook query finds a player who was only on a signup list', () => {
		const signup = seedSeason({ slug: 's2', status: 'signup' });
		db.insert(players).values({ id: 'new', discordId: 'd9', displayName: 'Newbie' }).run();
		seedEntries(signup.id, ['new']);
		const backup = Math.floor(Date.now() / 1000) - 1;
		erasePlayer('new', ORG);
		// docs/erasure.md, "After restoring a backup", step 2.
		expect(
			db.all(sql`select id from players where erased_at > ${backup}`).map((r: any) => r.id)
		).toEqual(['new']);
	});

	it('writes an erase row per season, with no personal data', () => {
		const other = seedSeason({ slug: 's2', status: 'finished' });
		seedEntries(other.id, ['p1']);
		erasePlayer('p1', ORG);
		expect(
			db
				.select()
				.from(audit)
				.where(eq(audit.action, 'erase'))
				.all()
				.map((r) => [r.seasonId, r.actorId, r.after])
		).toEqual([
			[season.id, ORG, { erased: 'p1' }],
			[other.id, ORG, { erased: 'p1' }]
		]);
	});

	it('refuses an unknown or already erased player, changing nothing', () => {
		expect(() => erasePlayer('nobody', ORG)).toThrow();
		erasePlayer('p1', ORG);
		const after = dump();
		expect(() => erasePlayer('p1', ORG)).toThrow();
		expect(dump()).toBe(after);
	});

	it('rolls back everything if a step fails', () => {
		const before = dump();
		// The audit rows come last; an unknown actor fails their foreign key.
		expect(() => erasePlayer('p1', 'nobody')).toThrow();
		expect(dump()).toBe(before);
	});
});

describe('leaderboard', () => {
	const won = (seasonId: number, p1Id: string, p2Id: string, at: number, extra = {}) =>
		seedMatch({
			seasonId,
			group: 1,
			round: 1,
			p1Id,
			p2Id,
			p1Games: 2,
			p2Games: 1,
			reportedBy: p1Id,
			reportedAt: new Date(at * 1000),
			...extra
		});
	const row = (id: string) => leaderboard().find((r) => r.playerId === id)!;

	it('rates every counted match across live seasons, and nothing else', () => {
		seedPlayers(5);
		const s1 = seedSeason({ status: 'finished' }).id;
		const s2 = seedSeason({ slug: 's2', status: 'play' }).id;
		const gone = seedSeason({ slug: 's3', status: 'finished', deletedAt: new Date() }).id;
		const signup = seedSeason({ slug: 's4', status: 'signup' }).id;
		seedEntries(s1, ['p1', 'p2', 'p3'], 1);
		seedEntries(s2, ['p1', 'p2', 'p3', 'p4'], 1);
		seedEntries(gone, ['p1', 'p2'], 1);
		seedEntries(signup, ['p5']);
		won(s1, 'p1', 'p2', 1);
		won(s2, 'p2', 'p3', 2);
		won(s2, 'p4', 'p1', 3);
		won(gone, 'p2', 'p1', 4);
		seedMatch({ seasonId: s2, group: 1, round: 2, p1Id: 'p1', p2Id: 'p3' }); // unreported
		won(s1, 'p1', 'p3', 6, { stage: 'playoff', group: null, walkoverId: 'p3' });
		// A match with a since-dropped player is voided in the standings but still rated.
		db.update(entries).set({ dropped: true }).where(eq(entries.playerId, 'p4')).run();

		const board = leaderboard();
		expect(board.map((r) => r.playerId)).toEqual(['p4', 'p2', 'p1', 'p3']);
		expect(row('p1')).toMatchObject({
			played: 2,
			wins: 1,
			draws: 0,
			losses: 1,
			gameWins: 3,
			gameLosses: 3,
			gwp: 0.5,
			seasons: 2
		});
		expect(board.reduce((n, r) => n + r.rating!, 0)).toBeCloseTo(1500 * 4);
	});

	it('orders by report time, then id', () => {
		seedPlayers(3);
		const s = seedSeason({ status: 'play' }).id;
		seedEntries(s, ['p1', 'p2', 'p3'], 1);
		won(s, 'p2', 'p3', 5);
		won(s, 'p1', 'p2', 5);
		const first = row('p1').rating;
		db.update(matches)
			.set({ reportedAt: new Date(1000) })
			.where(eq(matches.p1Id, 'p1'))
			.run();
		expect(row('p1').rating).not.toBeCloseTo(first!);
	});

	it('lists unrated players last with their best finish', () => {
		seedPlayers(4);
		const a = seedSeason({ status: 'finished' }).id;
		const b = seedSeason({ slug: 's2', status: 'play' }).id;
		seedEntries(a, ['p1', 'p2', 'p3', 'p4'], 1);
		seedEntries(b, ['p1', 'p2'], 1);
		won(a, 'p2', 'p1', 1);
		won(b, 'p1', 'p2', 2);
		won(b, 'p1', 'p2', 3);
		const board = leaderboard();
		expect(board.map((r) => [r.playerId, r.best])).toEqual([
			['p1', '#1 of 2'],
			['p2', '#1 of 4'],
			['p3', null],
			['p4', null]
		]);
		expect(board[2].rating).toBeNull();
	});
});
