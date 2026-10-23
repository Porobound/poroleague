import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Report } from '#lib/league/report.ts';
import { seasonFields } from '#lib/season.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, seasons } from '#lib/server/db/schema.ts';
import {
	flagMatch,
	getMatch,
	keepResult,
	organizerEdit,
	saveReport,
	type Match
} from '#lib/server/matches.ts';
import {
	cancelDrop,
	dropPlayer,
	finalizeSeason,
	publishWeek,
	setTiebreaks,
	updateSeason,
	type Season
} from '#lib/server/seasons.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

// CLAUDE.md: every result change writes an audit row. Each write here must leave exactly one.
const ORG = 'p4';
const report: Report = {
	p1Games: 2,
	p2Games: 1,
	p1Legend: 'Jinx',
	p2Legend: 'Viktor',
	diceWinnerId: 'p1'
};
const fixed: Report = { ...report, p1Games: 1, p2Games: 2 };

let season: Season;
let match: Match;

beforeEach(() => {
	const ids = seedPlayers(4);
	season = seedSeason({ status: 'play', publishedRound: 1 });
	seedEntries(season.id, ids, 1);
	db.update(entries).set({ tiebreak: 1 }).run();
	match = seedMatch({ seasonId: season.id, group: 1, round: 1, p1Id: 'p1', p2Id: 'p2' });
});

const rows = () => db.select().from(audit).all();
const only = () => {
	const all = rows();
	expect(all).toHaveLength(1);
	return all[0];
};
const tiebreaks = () =>
	db
		.select({ t: entries.tiebreak })
		.from(entries)
		.all()
		.map((e) => e.t);
const reload = () => getMatch(season.id, match.id)!;

describe('result writes', () => {
	it('saveReport: audits the report and clears tiebreaks', () => {
		saveReport(match, 'p1', report);
		expect(only()).toMatchObject({
			action: 'report',
			matchId: match.id,
			actorId: 'p1',
			before: null,
			after: report
		});
		expect(reload()).toMatchObject({ ...report, reportedBy: 'p1' });
		expect(tiebreaks()).toEqual([null, null, null, null]);
	});

	it('organizerEdit on an unreported match: the organizer becomes the reporter', () => {
		organizerEdit(match, ORG, report);
		expect(only()).toMatchObject({ action: 'edit', actorId: ORG, before: null, after: report });
		expect(reload()).toMatchObject({ reportedBy: ORG, flagResolvedAt: null });
		expect(tiebreaks()).toEqual([null, null, null, null]);
	});

	it('organizerEdit on a flagged match: keeps the reporter, resolves the flag, audits before/after', () => {
		saveReport(match, 'p1', report);
		flagMatch(reload(), 'p2', 'wrong score');
		db.delete(audit).run();
		db.update(entries).set({ tiebreak: 1 }).run();

		organizerEdit(reload(), ORG, fixed);
		expect(only()).toMatchObject({ action: 'edit', before: report, after: fixed });
		expect(reload()).toMatchObject({ ...fixed, reportedBy: 'p1', flagResolvedBy: ORG });
		expect(reload().flagResolvedAt).toBeInstanceOf(Date);
		expect(tiebreaks()).toEqual([null, null, null, null]);
	});

	it('organizerEdit leaves an already resolved flag alone', () => {
		saveReport(match, 'p1', report);
		flagMatch(reload(), 'p2', 'wrong score');
		keepResult(reload(), ORG);
		const resolvedAt = reload().flagResolvedAt;
		organizerEdit(reload(), 'p3', fixed);
		expect(reload()).toMatchObject({ flagResolvedBy: ORG, flagResolvedAt: resolvedAt });
	});

	it('flagMatch: audits the reason; the result and tiebreaks stay', () => {
		saveReport(match, 'p1', report);
		db.delete(audit).run();
		db.update(entries).set({ tiebreak: 1 }).run();
		flagMatch(reload(), 'p2', 'wrong score');
		expect(only()).toMatchObject({
			action: 'flag',
			actorId: 'p2',
			before: null,
			after: { flagReason: 'wrong score' }
		});
		expect(reload()).toMatchObject({ ...report, flaggedBy: 'p2', flagReason: 'wrong score' });
		expect(tiebreaks()).toEqual([1, 1, 1, 1]);
	});

	it('keepResult: resolves the flag and audits the kept result', () => {
		saveReport(match, 'p1', report);
		flagMatch(reload(), 'p2', 'wrong score');
		db.delete(audit).run();
		keepResult(reload(), ORG);
		expect(only()).toMatchObject({ action: 'resolve', actorId: ORG, after: report });
		expect(reload()).toMatchObject({ ...report, flagResolvedBy: ORG });
	});
});

describe('drops and tiebreaks', () => {
	it('dropPlayer and cancelDrop: audit each and clear tiebreaks', () => {
		dropPlayer(season.id, 'p2', ORG);
		expect(only()).toMatchObject({ action: 'drop', actorId: ORG, after: { dropped: 'p2' } });
		expect(db.select().from(entries).where(eq(entries.playerId, 'p2')).get()?.dropped).toBe(true);
		expect(tiebreaks()).toEqual([null, null, null, null]);

		db.delete(audit).run();
		db.update(entries).set({ tiebreak: 1 }).run();
		cancelDrop(season.id, 'p2', ORG);
		expect(only()).toMatchObject({ action: 'undrop', after: { undropped: 'p2' } });
		expect(db.select().from(entries).where(eq(entries.playerId, 'p2')).get()?.dropped).toBe(false);
		expect(tiebreaks()).toEqual([null, null, null, null]);
	});

	it('setTiebreaks: ranks in order and audits the order', () => {
		db.update(entries).set({ tiebreak: null }).run();
		setTiebreaks(season.id, ['p3', 'p1'], ORG);
		expect(only()).toMatchObject({ action: 'tiebreak', after: { order: ['p3', 'p1'] } });
		const rank = Object.fromEntries(
			db
				.select()
				.from(entries)
				.all()
				.map((e) => [e.playerId, e.tiebreak])
		);
		expect(rank).toEqual({ p1: 2, p2: null, p3: 1, p4: null });
	});
});

describe('season writes', () => {
	const status = () => db.select().from(seasons).where(eq(seasons.id, season.id)).get()!;

	it('finalizeSeason: finishes and audits', () => {
		finalizeSeason(season.id, ORG);
		expect(only()).toMatchObject({ action: 'finalize', actorId: ORG, matchId: null });
		expect(status().status).toBe('finished');
	});

	it('publishWeek: moves publishedRound and audits the week', () => {
		publishWeek(season.id, 2, [3, 4], ORG);
		expect(only()).toMatchObject({ action: 'publish', after: { week: 2, rounds: [3, 4] } });
		expect(status().publishedRound).toBe(4);
	});

	it('updateSeason: audits only the changed settings', () => {
		const values = { ...seasonFields(season), name: 'Renamed', deadline: '2026-12-01' };
		updateSeason(season, values, ORG);
		expect(only()).toMatchObject({
			action: 'season',
			before: { name: 'Season 1', deadline: '' },
			after: { name: 'Renamed', deadline: '2026-12-01' }
		});
		expect(status()).toMatchObject({ name: 'Renamed', deadline: '2026-12-01' });
	});

	it('updateSeason: no row when nothing changed, or when only the slug changed', () => {
		updateSeason(season, seasonFields(season), ORG);
		updateSeason(season, { ...seasonFields(season), slug: 's2' }, ORG);
		expect(rows()).toEqual([]);
		expect(status().slug).toBe('s2');
	});

	it('updateSeason: a draft is edited without audit', () => {
		const draft = seedSeason({ slug: 'd', status: 'draft' });
		updateSeason(draft, { ...seasonFields(draft), name: 'Draft renamed' }, ORG);
		expect(rows()).toEqual([]);
	});
});
