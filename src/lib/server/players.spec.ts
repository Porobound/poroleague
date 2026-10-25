import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Report } from '#lib/league/report.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, players, seasons, sessions } from '#lib/server/db/schema.ts';
import { adminRows, flagMatch, getMatch, saveReport } from '#lib/server/matches.ts';
import { discordMentions, erasePlayer } from '#lib/server/players.ts';
import {
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
		const name = erasePlayer('p1', ORG);
		expect(name).toMatch(/^Former player [0-9a-f]{4}$/);
		expect(player('p1')).toMatchObject({ displayName: name, avatar: null, discordId: null });
		expect(player('p1').erasedAt).toBeInstanceOf(Date);
		expect(erasePlayer('p2', ORG)).not.toBe(name);
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
		erasePlayer('p1', ORG);
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

	it('keeps an earlier drop as it is', () => {
		dropPlayer(season.id, 'p1', ORG);
		erasePlayer('p1', ORG);
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
