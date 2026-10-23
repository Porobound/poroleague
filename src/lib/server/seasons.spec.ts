import { isHttpError } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Report } from '#lib/league/report.ts';
import { auditLines } from '#lib/server/auditLog.ts';
import { db } from '#lib/server/db/index.ts';
import { entries, matches, seasons } from '#lib/server/db/schema.ts';
import { flagMatch, getMatch, saveReport } from '#lib/server/matches.ts';
import { endState, nextPairings, seasonData } from '#lib/server/seasonAdmin.ts';
import {
	deleteSeason,
	dropPlayer,
	getSeason,
	myPlayerPage,
	publicSeason,
	publishWeek,
	reopenSignup,
	runningSeason,
	setTiebreaks,
	slugTaken,
	updateSeason,
	type Season
} from '#lib/server/seasons.ts';
import { seasonFields } from '#lib/season.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

const ORG = { id: 'p9', displayName: 'Org', avatar: null, isOrganizer: true };
const PLAYER = { ...ORG, id: 'p1', isOrganizer: false };
const notFound = (f: () => unknown) => {
	try {
		f();
	} catch (e) {
		return isHttpError(e) && e.status === 404;
	}
	return false;
};
const score = (p1Games: number, p2Games: number): Report => ({
	p1Games,
	p2Games,
	p1Legend: 'Jinx',
	p2Legend: 'Viktor',
	diceWinnerId: 'p1'
});
const reload = (s: Season) => db.select().from(seasons).where(eq(seasons.id, s.id)).get()!;

let season: Season;
let ms: number[];

// Group of three in play, two rounds a week, three rounds in all.
beforeEach(() => {
	seedPlayers(9);
	season = seedSeason({ status: 'play', roundsPerWeek: 2 });
	seedEntries(season.id, ['p1', 'p2', 'p3'], 1);
	ms = [
		[1, 'p1', 'p2'],
		[2, 'p1', 'p3'],
		[3, 'p2', 'p3']
	].map(
		([round, p1Id, p2Id]) =>
			seedMatch({
				seasonId: season.id,
				group: 1,
				round: round as number,
				p1Id: p1Id as string,
				p2Id: p2Id as string
			}).id
	);
});
const report = (i: number, r: Report) => saveReport(getMatch(season.id, ms[i])!, 'p1', r);

describe('nextPairings', () => {
	it('offers the next week, then the rest, then nothing', () => {
		expect(nextPairings(season, seasonData(season.id))).toMatchObject({
			week: 1,
			rounds: [1, 2],
			count: 2,
			byRound: [
				{ round: 1, pairs: [{ group: 1, p1Id: 'p1', p2Id: 'p2' }] },
				{ round: 2, pairs: [{ group: 1, p1Id: 'p1', p2Id: 'p3' }] }
			]
		});
		publishWeek(season.id, 1, [1, 2], ORG.id);
		expect(nextPairings(reload(season), seasonData(season.id))).toMatchObject({
			week: 2,
			rounds: [3, 3],
			count: 1
		});
		publishWeek(season.id, 2, [3, 3], ORG.id);
		expect(nextPairings(reload(season), seasonData(season.id))).toBeNull();
	});

	it('leaves void matches out of the post', () => {
		dropPlayer(season.id, 'p3', ORG.id);
		const p = nextPairings(season, seasonData(season.id))!;
		expect(p.count).toBe(1);
		expect(p.byRound.map((r) => r.round)).toEqual([1]);
	});
});

describe('endState', () => {
	const end = (now = new Date()) => endState(reload(season), seasonData(season.id), now);

	it('is not ending while matches are unplayed before the deadline', () => {
		expect(end()).toMatchObject({
			closed: false,
			unplayed: 3,
			ending: false,
			ties: [],
			ready: false
		});
	});

	it('ends early once every live match is reported, and waits on open flags', () => {
		report(0, score(2, 0));
		dropPlayer(season.id, 'p3', ORG.id); // voids both of p3's matches
		expect(end()).toMatchObject({ unplayed: 0, ending: true, ready: true });
		flagMatch(getMatch(season.id, ms[0])!, 'p2', 'wrong');
		expect(end()).toMatchObject({ openFlags: 1, ready: false });
	});

	it('names a two-way tie after a draw and waits for its order', () => {
		report(0, score(1, 1));
		report(1, score(2, 0));
		report(2, score(2, 0));
		const e = end();
		expect(e.ending).toBe(true);
		expect(e.ties).toHaveLength(1);
		expect(e.ties[0]).toMatchObject({ group: 1, resolved: false, points: 4, h2h: 'drew 1–1' });
		expect(e.ties[0].players.map((p) => [p.playerId, p.place]).sort()).toEqual([
			['p1', 1],
			['p2', 2]
		]);
		expect(e.ready).toBe(false);

		setTiebreaks(season.id, ['p2', 'p1'], ORG.id);
		expect(end()).toMatchObject({ ready: true, ties: [{ resolved: true }] });
	});

	it('at the deadline unplayed matches count and a three-way tie is "level"', () => {
		db.update(seasons).set({ deadline: '2020-01-01' }).run();
		const e = end();
		expect(e).toMatchObject({ closed: true, ending: true, unplayed: 3, ready: false });
		expect(e.ties).toMatchObject([{ h2h: 'level', points: 0 }]);
		expect(e.ties[0].players).toHaveLength(3);
	});

	it('a tie between players who never met says "not played"', () => {
		db.update(seasons).set({ deadline: '2020-01-01' }).run();
		report(0, score(2, 0)); // p1 beats p2; p2 and p3 never play and tie on zero
		const tie = end().ties.find((t) => t.players.some((p) => p.playerId === 'p3'));
		expect(tie).toMatchObject({ h2h: 'not played' });
	});
});

describe('season lookups', () => {
	it('hides drafts from players and deleted seasons from everyone', () => {
		seedSeason({ slug: 'd', status: 'draft' });
		expect(notFound(() => getSeason('d', PLAYER))).toBe(true);
		expect(notFound(() => getSeason('d', null))).toBe(true);
		expect(getSeason('d', ORG).slug).toBe('d');
		expect(notFound(() => publicSeason('d', ORG))).toBe(true);

		deleteSeason(season, ORG.id);
		expect(notFound(() => getSeason('s1', ORG))).toBe(true);
		expect(slugTaken('s1')).toBe(false);
	});

	it('runningSeason ignores drafts, finished seasons and the season itself', () => {
		const draft = seedSeason({ slug: 'd', status: 'draft' });
		seedSeason({ slug: 'f', status: 'finished' });
		expect(runningSeason(draft.id)).toEqual({ name: 'Season 1', slug: 's1' });
		expect(runningSeason(season.id)).toBeUndefined();
		deleteSeason(season, ORG.id);
		expect(runningSeason(draft.id)).toBeUndefined();
	});

	it('reopenSignup clears the draw', () => {
		db.update(seasons).set({ status: 'groups' }).run();
		db.delete(matches).run();
		reopenSignup(season.id);
		expect(reload(season).status).toBe('signup');
		expect(db.select({ g: entries.group }).from(entries).all()).toEqual([
			{ g: null },
			{ g: null },
			{ g: null }
		]);
	});

	it('myPlayerPage prefers the season being viewed, then the newest public one', () => {
		const newer = seedSeason({ slug: 's2', status: 'signup' });
		const draft = seedSeason({ slug: 's3', status: 'draft' });
		seedEntries(newer.id, ['p1']);
		seedEntries(draft.id, ['p1']);
		expect(myPlayerPage('p1')).toBe('/seasons/s2/players/p1');
		expect(myPlayerPage('p1', 's1')).toBe('/seasons/s1/players/p1');
		expect(myPlayerPage('p1', 's3')).toBe('/seasons/s2/players/p1');
		expect(myPlayerPage('p8')).toBeNull();
	});
});

describe('auditLines', () => {
	it('writes one readable line per change, newest first', () => {
		report(0, score(2, 1));
		flagMatch(getMatch(season.id, ms[0])!, 'p2', 'wrong score');
		dropPlayer(season.id, 'p3', ORG.id);
		publishWeek(season.id, 2, [3, 4], ORG.id);
		updateSeason(season, { ...seasonFields(season), deadline: '2026-12-01' }, ORG.id);

		const lines = auditLines(season.id);
		expect(lines.map((l) => [l.label, l.what])).toEqual([
			['Season', 'Deadline — → 1 Dec 2026'],
			['Publish', 'Week 2 published · R3–4'],
			['Drop', 'Dropped Player 3; their matches are void'],
			['Flag', 'Group A R1 · Player 1 vs Player 2 · “wrong score”'],
			['Report', 'Group A R1 · Player 1 2–1 Player 2 · Jinx vs Viktor · dice: Player 1']
		]);
		expect(lines[0].actor).toBe('Player 9');
		expect(auditLines(season.id, 2)).toHaveLength(2);
	});
});
