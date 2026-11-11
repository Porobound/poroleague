import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, playerAchievements, seasons } from '#lib/server/db/schema.ts';
import {
	awardAchievements,
	backfillAchievements,
	careerAchievements
} from '#lib/server/achievements.ts';
import { flagMatch, keepResult, organizerEdit, saveReport } from '#lib/server/matches.ts';
import { cancelDrop, dropPlayer, finalizeSeason, publishWeek } from '#lib/server/seasons.ts';
import type { Report } from '#lib/league/report.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

const D = (day: number) => new Date(Date.UTC(2026, 0, day));
const rows = (playerId: string) =>
	db.select().from(playerAchievements).where(eq(playerAchievements.playerId, playerId)).all();
const row = (playerId: string, id: string) => rows(playerId).find((r) => r.achievementId === id);
// p1 beats p2 2–0 as Ahri, reported on `day`.
const win = (seasonId: number, round: number, day: number) =>
	seedMatch({
		seasonId,
		group: 1,
		round,
		p1Id: 'p1',
		p2Id: 'p2',
		p1Games: 2,
		p2Games: 0,
		p1Legend: 'Ahri',
		p2Legend: 'Annie',
		diceWinnerId: 'p1',
		reportedBy: 'p1',
		reportedAt: D(day)
	});
const season = (slug: string, values = {}) => {
	const s = seedSeason({ slug, status: 'play', publishedRound: 9, ...values });
	seedEntries(s.id, ['p1', 'p2'], 1);
	return s;
};

describe('awardAchievements', () => {
	it('dates each achievement by the historic result that earned it', () => {
		seedPlayers(2);
		const [a, b] = [season('a'), season('b')];
		win(a.id, 1, 1);
		win(a.id, 2, 5);
		win(b.id, 1, 9);
		awardAchievements(db, ['p1', 'p2']);
		expect(row('p1', 'first-blood')).toMatchObject({ unlockedAt: D(1), seasonId: a.id });
		expect(row('p1', 'legend-ahri-bronze')).toMatchObject({ unlockedAt: D(9), seasonId: b.id });
		expect(row('p1', 'dice-bronze')).toMatchObject({ unlockedAt: D(9) });
		// The second season's first match makes both of them Veterans.
		expect(row('p1', 'seasons-bronze')).toMatchObject({ unlockedAt: D(9), seasonId: b.id });
		expect(rows('p2').map((r) => r.achievementId)).toEqual([
			'legend-annie-bronze',
			'seasons-bronze'
		]);
	});

	it('is idempotent and never rewrites or removes a row', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 3);
		db.insert(playerAchievements)
			.values({ playerId: 'p1', achievementId: 'first-blood', unlockedAt: D(1), seasonId: null })
			.run();
		db.insert(playerAchievements)
			.values({ playerId: 'p1', achievementId: 'champion', unlockedAt: D(2), seasonId: null })
			.run();
		awardAchievements(db, ['p1']);
		awardAchievements(db, ['p1']);
		expect(row('p1', 'first-blood')!.unlockedAt).toEqual(D(1));
		expect(row('p1', 'champion')).toBeDefined();
		expect(rows('p1')).toHaveLength(2);
	});

	it('skips hidden rounds, drops, deleted and draft seasons', () => {
		seedPlayers(2);
		const hidden = season('h', { publishedRound: 1 });
		win(hidden.id, 2, 1);
		const deleted = season('d', { deletedAt: D(4) });
		win(deleted.id, 1, 2);
		const voided = season('v');
		win(voided.id, 1, 3);
		db.update(entries).set({ dropped: true }).where(eq(entries.seasonId, voided.id)).run();
		const draft = season('dr', { status: 'draft' });
		win(draft.id, 1, 5);
		awardAchievements(db, ['p1']);
		expect(rows('p1')).toEqual([]);
	});

	it('reads season events from the audit log', () => {
		seedPlayers(2);
		const s = season('a', { status: 'finished' });
		win(s.id, 1, 1);
		db.update(entries).set({ slot: 0, seed: 1 }).where(eq(entries.playerId, 'p1')).run();
		db.insert(audit)
			.values([
				{ seasonId: s.id, actorId: 'p1', action: 'finalize', createdAt: D(10) },
				{ seasonId: s.id, actorId: 'p1', action: 'topcut', createdAt: D(11) },
				{
					seasonId: s.id,
					actorId: 'p1',
					action: 'champion',
					after: { champion: 'p1' },
					createdAt: D(12)
				}
			])
			.run();
		awardAchievements(db, ['p1', 'p2']);
		expect(row('p1', 'perfect-group')!.unlockedAt).toEqual(D(10));
		expect(row('p1', 'top-cut')!.unlockedAt).toEqual(D(11));
		expect(row('p1', 'champion')!.unlockedAt).toEqual(D(12));
		expect(row('p2', 'top-cut')).toBeUndefined();
	});
});

describe('backfillAchievements', () => {
	it('awards every player', () => {
		seedPlayers(2);
		win(season('a').id, 1, 1);
		backfillAchievements(db);
		expect(row('p1', 'first-blood')).toBeDefined();
	});
});

const result = (p1Games: number, p2Games: number): Report => ({
	games: null,
	p1Games,
	p2Games,
	p1Legend: 'Ahri',
	p2Legend: 'Annie',
	diceWinnerId: 'p1'
});
const open = (seasonId: number, round = 1) =>
	seedMatch({ seasonId, group: 1, round, p1Id: 'p1', p2Id: 'p2' });

describe('result writes award', () => {
	it('report, and an edit after it keeps what was earned (award-only)', () => {
		seedPlayers(2);
		const m = open(season('a').id);
		saveReport(m, 'p1', result(2, 0));
		expect(row('p1', 'first-blood')).toBeDefined();
		organizerEdit({ ...m, reportedBy: 'p1' }, 'p2', result(0, 2));
		expect(row('p1', 'first-blood')).toBeDefined();
		expect(row('p2', 'first-blood')).toBeDefined();
	});

	it('flag resolve', () => {
		seedPlayers(2);
		const m = win(season('a').id, 1, 1);
		flagMatch(m, 'p2', 'wrong');
		keepResult(m, 'p1');
		expect(row('p1', 'first-blood')!.unlockedAt).toEqual(D(1));
	});

	it('week publish counts an earlier hidden result, dated by its report', () => {
		seedPlayers(2);
		const s = season('a', { publishedRound: 1 });
		win(s.id, 2, 3);
		publishWeek(s.id, 1, [2, 2], 'p1');
		expect(row('p1', 'first-blood')!.unlockedAt).toEqual(D(3));
	});

	it('finalize awards Perfect Group', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 1);
		finalizeSeason(s.id, 'p1', false);
		expect(row('p1', 'perfect-group')).toBeDefined();
		expect(row('p2', 'perfect-group')).toBeUndefined();
	});

	it('undrop after finalize recounts Perfect Group', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 1);
		dropPlayer(s.id, 'p2', 'p1');
		finalizeSeason(s.id, 'p1', false);
		expect(row('p1', 'perfect-group')).toBeUndefined(); // only match void
		cancelDrop(s.id, 'p2', 'p1');
		expect(row('p1', 'perfect-group')).toBeDefined();
		expect(row('p1', 'first-blood')).toBeDefined();
	});
});

describe('careerAchievements', () => {
	it('gives one row per started track, with the tier reached and progress to the next', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 1);
		win(s.id, 2, 2);
		db.insert(playerAchievements)
			.values([
				{ playerId: 'p1', achievementId: 'legend-jinx-bronze', unlockedAt: D(5), seasonId: null },
				{ playerId: 'p1', achievementId: 'legend-jinx-silver', unlockedAt: D(6), seasonId: null },
				{ playerId: 'p1', achievementId: 'legend-jinx-gold', unlockedAt: D(7), seasonId: null },
				{
					playerId: 'p1',
					achievementId: 'legend-renamed-bronze',
					unlockedAt: D(5),
					seasonId: null
				},
				{ playerId: 'p1', achievementId: 'dice-bronze', unlockedAt: D(2), seasonId: s.id }
			])
			.run();
		const c = careerAchievements(db, 'p1');
		expect(c.earned).toBe(4); // unknown ids don't count
		// In progress first, finished tracks last. Legends never played aren't listed.
		expect(c.legends.map((t) => t.name)).toEqual(['Ahri', 'Jinx']);
		const [ahri, jinx] = c.legends;
		expect(ahri).toMatchObject({
			kind: 'legend',
			icon: '/achievements/champions/ahri.png',
			tier: null,
			next: { have: 2, need: 3, name: 'Ahri Player' }
		});
		expect(ahri.tiers.map((t) => [t.name, t.need, t.earned])).toEqual([
			['Ahri Player', 3, null],
			['Ahri Expert', 10, null],
			['Ahri Master', 25, null]
		]);
		expect(jinx).toMatchObject({ tier: 'gold', next: null });
		expect(jinx.tiers.map((t) => t.earned)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
		expect(c.league.map((t) => [t.name, t.kind, t.tier, t.next])).toEqual([
			['Variety', 'rank', null, { have: 1, need: 3, name: 'Variety Player' }], // Ahri has her 2 matches
			['Dice', 'rank', 'bronze', { have: 2, need: 6, name: 'Dice Expert' }],
			['Seasons', 'item', null, { have: 1, need: 2, name: 'Veteran' }],
			['Comeback', 'item', null, { have: 0, need: 1, name: 'Comeback Kid' }]
		]);
		// A rank track shows the emblem of the tier reached.
		expect(c.league[1].icon).toBe('/achievements/tiers/bronze.png');
		expect(c.ones.map((t) => [t.id, t.earned])).toEqual([
			['first-blood', null], // seeded results weren't awarded
			['perfect-group', null],
			['top-cut', null],
			['champion', null]
		]);
	});
});
