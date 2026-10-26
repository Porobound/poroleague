import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { entries } from '#lib/server/db/schema.ts';
import {
	bracketMatches,
	lastLegend,
	playerMatches,
	saveReport,
	seasonMatches
} from '#lib/server/matches.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

describe('lastLegend', () => {
	it('is the legend of the latest reported match, from either side and any season', () => {
		seedPlayers(3);
		const s1 = seedSeason();
		const s2 = seedSeason({ slug: 's2', name: 'Season 2' });
		expect(lastLegend('p1')).toBeNull();

		const played = (seasonId: number, at: number, p1Id: string, p2Id: string, legends: string[]) =>
			seedMatch({
				seasonId,
				round: 1,
				p1Id,
				p2Id,
				p1Legend: legends[0],
				p2Legend: legends[1],
				reportedAt: new Date(at * 1000)
			});
		played(s1.id, 2000, 'p1', 'p2', ['Jinx', 'Viktor']);
		expect(lastLegend('p1')).toBe('Jinx');
		expect(lastLegend('p2')).toBe('Viktor');

		// A newer match in another season, as p2; an older one doesn't win.
		played(s2.id, 3000, 'p3', 'p1', ['Ahri', 'Annie']);
		played(s2.id, 1000, 'p1', 'p3', ['Ashe', 'Ahri']);
		expect(lastLegend('p1')).toBe('Annie');

		// Unreported matches don't count, even with a legend set.
		seedMatch({ seasonId: s2.id, round: 2, p1Id: 'p1', p2Id: 'p2', p1Legend: 'Garen' });
		expect(lastLegend('p1')).toBe('Annie');
	});
});

describe('playoff rows', () => {
	it('stay out of the group-stage queries', () => {
		const s = seedSeason({ status: 'topcut' });
		seedPlayers(2);
		seedEntries(s.id, ['p1', 'p2'], 1);
		seedMatch({ seasonId: s.id, group: 1, round: 1, p1Id: 'p1', p2Id: 'p2' });
		seedMatch({ seasonId: s.id, stage: 'playoff', round: 1, slot: 0, p1Id: 'p1', p2Id: 'p2' });
		expect(seasonMatches(s.id)).toHaveLength(1);
		expect(playerMatches(s.id, 'p1')).toHaveLength(1);
		expect(bracketMatches(s.id)).toHaveLength(1);
	});

	it('reporting one keeps the group tiebreaks', () => {
		const s = seedSeason({ status: 'topcut' });
		seedPlayers(2);
		seedEntries(s.id, ['p1', 'p2'], 1);
		db.update(entries).set({ tiebreak: 1 }).where(eq(entries.playerId, 'p1')).run();
		const m = seedMatch({
			seasonId: s.id,
			stage: 'playoff',
			round: 1,
			slot: 0,
			p1Id: 'p1',
			p2Id: 'p2'
		});
		saveReport(m, 'p1', {
			games: '11',
			p1Games: 2,
			p2Games: 0,
			p1Legend: 'Jinx',
			p2Legend: 'Viktor',
			diceWinnerId: 'p1'
		});
		expect(db.select().from(entries).where(eq(entries.playerId, 'p1')).get()!.tiebreak).toBe(1);
	});
});
