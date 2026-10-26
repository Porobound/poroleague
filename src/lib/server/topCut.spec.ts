import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, seasons } from '#lib/server/db/schema.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';
import { organizerEdit, saveReport } from '#lib/server/matches.ts';
import { cutPreview, cutState, nextPlayed, publishCut, walkover } from './topCut.ts';

let id: number;
// Two groups of three, every group match played: A = p1 > p2 > p3, B = p4 > p5 > p6.
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

describe('cutPreview', () => {
	it('takes the top N per group, cross-seeded', () => {
		const p = cutPreview(season());
		expect(p.problem).toBeNull();
		expect(p.size).toEqual({ per: 2, total: 4, bracket: 4, byes: 0 });
		expect(p.firstRound.map((m) => [m.p1?.label, m.p2?.label])).toEqual([
			['A1', 'B2'],
			['B1', 'A2']
		]);
	});

	it('skips dropped players and refuses a group that runs short', () => {
		db.update(entries).set({ dropped: true }).where(eq(entries.playerId, 'p2')).run();
		expect(cutPreview(season()).firstRound.flatMap((m) => [m.p1?.id, m.p2?.id])).toContain('p3');
		db.update(entries).set({ dropped: true }).where(eq(entries.playerId, 'p3')).run();
		expect(cutPreview(season()).problem).toMatch(/Group A/);
	});

	it('refuses more than 32', () => {
		db.update(seasons).set({ topCutSize: 17 }).run();
		expect(cutPreview(season()).problem).toBeTruthy();
	});
});

describe('publishCut', () => {
	it('stores seeds and slots, creates the first round, audits', () => {
		publishCut(season(), '2026-12-05', 'p1');
		const s = cutState(season());
		expect(s.rounds[0].map((x) => [x.p1, x.p2])).toEqual([
			['p1', 'p5'],
			['p4', 'p2']
		]);
		expect(db.select().from(matches).where(eq(matches.stage, 'playoff')).all()).toHaveLength(2);
		expect(season().topCutDate).toBe('2026-12-05');
		expect(
			db
				.select()
				.from(audit)
				.all()
				.map((a) => a.action)
		).toContain('topcut');
	});

	it('refuses twice', () => {
		publishCut(season(), null, 'p1');
		expect(() => publishCut(season(), null, 'p1')).toThrow();
	});
});

const won = (p1: number, p2: number) => ({
	games: null,
	p1Games: p1,
	p2Games: p2,
	p1Legend: 'Jinx',
	p2Legend: 'Viktor',
	diceWinnerId: 'p1'
});
const slot = (round: number, s: number) => cutState(season()).rounds[round - 1][s];

describe('advancing', () => {
	beforeEach(() => publishCut(season(), null, 'p1'));

	it('a report fills the final once both semis are in; level sends the higher seed', () => {
		saveReport(slot(1, 0).match!, 'p1', won(2, 0));
		expect(slot(2, 0).match).toBeNull();
		saveReport(slot(1, 1).match!, 'p4', won(1, 1)); // p4 (B1) vs p2 (A2), level
		expect([slot(2, 0).p1, slot(2, 0).p2]).toEqual(['p1', 'p4']);
		expect(slot(2, 0).match).not.toBeNull();
	});

	it('an edit repoints the next match while it is unreported, then is refused', () => {
		saveReport(slot(1, 0).match!, 'p1', won(2, 0));
		walkover(season(), slot(1, 1).match!, 'p2', 'p1');
		expect(nextPlayed(season(), slot(1, 0).match!)).toBe(false);
		organizerEdit(slot(1, 0).match!, 'p1', won(0, 2));
		expect([slot(2, 0).p1, slot(2, 0).p2]).toEqual(['p5', 'p2']);
		saveReport(slot(2, 0).match!, 'p5', won(2, 1));
		expect(nextPlayed(season(), slot(1, 0).match!)).toBe(true);
		expect(cutState(season()).champion).toBe('p5');
	});

	it('a walkover advances the picked player and is audited', () => {
		walkover(season(), slot(1, 0).match!, 'p5', 'p1');
		expect(slot(1, 0).winner).toBe('p5');
		expect(
			db
				.select()
				.from(audit)
				.all()
				.map((a) => a.action)
		).toContain('walkover');
	});
});
