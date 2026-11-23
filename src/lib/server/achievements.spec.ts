import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, playerAchievements, players, seasons } from '#lib/server/db/schema.ts';
import {
	awardAchievements,
	backfillAchievements,
	careerAchievements
} from '#lib/server/achievements.ts';
import { flagMatch, keepResult, organizerEdit, saveReport } from '#lib/server/matches.ts';
import { cancelDrop, dropPlayer, finalizeSeason, publishWeek } from '#lib/server/seasons.ts';
import type { Report } from '#lib/league/report.ts';
import { LEGENDS } from '#lib/legends.ts';
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
		games: '11',
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
		expect(row('p1', 'streak-bronze')).toMatchObject({ unlockedAt: D(9), seasonId: b.id });
		expect(row('p1', 'dice-bronze')).toMatchObject({ unlockedAt: D(9) });
		// Neither season is finalized, so nobody has finished one.
		expect(row('p1', 'seasons-bronze')).toBeUndefined();
		expect(rows('p2').map((r) => r.achievementId)).toEqual(['swept']);
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
		const first = rows('p1');
		awardAchievements(db, ['p1']);
		expect(row('p1', 'first-blood')!.unlockedAt).toEqual(D(1));
		expect(row('p1', 'champion')).toBeDefined();
		expect(rows('p1')).toEqual(first);
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
	games: p1Games > p2Games ? '11' : '22',
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

	it('finalize counts the season as finished, for players who were not dropped', () => {
		seedPlayers(3);
		const a = season('a', { status: 'finished' });
		win(a.id, 1, 1);
		db.insert(audit)
			.values({ seasonId: a.id, actorId: 'p1', action: 'finalize', createdAt: D(2) })
			.run();
		const b = season('b');
		win(b.id, 1, 5);
		finalizeSeason(b.id, 'p1', false);
		expect(row('p1', 'seasons-bronze')).toMatchObject({ seasonId: b.id });
		expect(row('p2', 'seasons-bronze')).toBeDefined();
		expect(row('p3', 'seasons-bronze')).toBeUndefined(); // never entered
	});

	it('finalize places everyone in their group', () => {
		seedPlayers(4);
		const s = seedSeason({ slug: 'g', status: 'play', publishedRound: 9, topCutSize: 2 });
		seedEntries(s.id, ['p1', 'p2', 'p3', 'p4'], 1);
		const play = (round: number, p1Id: string, p2Id: string, p1Games: number, p2Games: number) =>
			seedMatch({
				seasonId: s.id,
				group: 1,
				round,
				p1Id,
				p2Id,
				p1Games,
				p2Games,
				p1Legend: 'Ahri',
				p2Legend: 'Annie',
				reportedBy: p1Id,
				reportedAt: D(round)
			});
		// p1, p2 and p3 each win two, beating each other in a circle; p4 loses all three.
		play(1, 'p1', 'p2', 2, 0);
		play(1, 'p3', 'p4', 2, 0);
		play(2, 'p1', 'p3', 0, 2);
		play(2, 'p2', 'p4', 2, 0);
		play(3, 'p1', 'p4', 2, 0);
		play(3, 'p2', 'p3', 2, 0);
		finalizeSeason(s.id, 'p1', false);
		const has = (id: string) => ['p1', 'p2', 'p3', 'p4'].filter((p) => row(p, id)).join();
		const first = has('group-winner');
		expect(first).toHaveLength(2); // exactly one winner
		expect(has('wooden-spoon')).toBe('p4');
		expect(has('participation-trophy')).toBe('p4');
		expect(has('bubble')).toHaveLength(2);
		expect(has('one-trick')).toBe('p1,p2,p3,p4');
		// Whoever beat the winner in the group slew the giant.
		expect(has('giant-slayer')).not.toContain(first);
		expect(has('giant-slayer')).not.toBe('');
	});

	it('undrop after finalize recounts the void matches', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 1);
		dropPlayer(s.id, 'p2', 'p1');
		finalizeSeason(s.id, 'p1', false);
		expect(row('p1', 'first-blood')).toBeUndefined(); // only match void
		cancelDrop(s.id, 'p2', 'p1');
		expect(row('p1', 'first-blood')).toBeDefined();
	});
});

describe('careerAchievements', () => {
	it('gives one row per achievement at the level reached, and the mastery of each legend played', () => {
		seedPlayers(2);
		const s = season('a');
		win(s.id, 1, 1);
		win(s.id, 2, 2);
		db.insert(playerAchievements)
			.values([
				{ playerId: 'p1', achievementId: 'comeback-bronze', unlockedAt: D(5), seasonId: null },
				{ playerId: 'p1', achievementId: 'comeback-silver', unlockedAt: D(6), seasonId: null },
				{ playerId: 'p1', achievementId: 'comeback-gold', unlockedAt: D(7), seasonId: null },
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
		// Every legend is listed, most played first.
		expect(c.legends).toHaveLength(LEGENDS.length);
		expect(c.legends[0]).toEqual({
			legend: 'Ahri',
			icon: '/achievements/champions/ahri.png',
			matches: 2,
			rank: null,
			earned: null,
			season: null,
			next: { rank: 'bronze', need: 3 }
		});
		expect(c.legends[1]).toMatchObject({ legend: 'Akali', matches: 0, rank: null });
		expect(c.total).toBe(28);
		expect(c.earned).toBe(2); // Comeback and Dice; the unknown id doesn't count
		// Earned first, highest rank on top.
		const [comeback, dice, ...rest] = c.list;
		expect(comeback).toEqual({
			key: 'comeback',
			name: 'Comeback Emperor',
			description: 'Win 15 matches after losing game 1.',
			icon: '/achievements/items/comeback.png',
			rank: 'diamond',
			earned: '2026-01-07',
			season: null,
			level: 3,
			levels: 3,
			next: null
		});
		expect(dice).toMatchObject({
			key: 'dice',
			name: 'Lucky',
			rank: 'bronze',
			earned: '2026-01-02',
			season: { slug: 'a' },
			level: 1,
			next: { have: 2, need: 6, name: 'Charmed' }
		});
		// Then what is under way, then the rest from the easiest rank up.
		expect(rest.every((a) => !a.earned)).toBe(true);
		const place = (key: string) => rest.findIndex((a) => a.key === key);
		expect(rest[place('wins')]).toMatchObject({
			name: 'Contender',
			next: { have: 2, need: 5, name: 'Contender' }
		});
		expect(place('wins')).toBeLessThan(place('wooden-spoon'));
		expect(place('wooden-spoon')).toBeLessThan(place('dynasty'));
	});

	it('names the season an achievement was earned in, unless it was deleted', () => {
		seedPlayers(2);
		const s = season('a');
		db.insert(playerAchievements)
			.values({ playerId: 'p1', achievementId: 'champion', unlockedAt: D(3), seasonId: s.id })
			.run();
		const champion = () => careerAchievements(db, 'p1').list[0];
		expect(champion()).toMatchObject({ key: 'champion', season: { slug: 'a', name: s.name } });
		db.update(seasons)
			.set({ deletedAt: D(4) })
			.where(eq(seasons.id, s.id))
			.run();
		expect(champion()).toMatchObject({ key: 'champion', earned: '2026-01-03', season: null });
	});
});
