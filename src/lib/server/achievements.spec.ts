import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, playerAchievements, seasons } from '#lib/server/db/schema.ts';
import { awardAchievements, backfillAchievements } from '#lib/server/achievements.ts';
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
		expect(row('p1', 'legend-ahri-player')).toMatchObject({ unlockedAt: D(9), seasonId: b.id });
		expect(row('p1', 'dice-player')).toMatchObject({ unlockedAt: D(9) });
		expect(rows('p2').map((r) => r.achievementId)).toEqual(['legend-annie-player']);
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
