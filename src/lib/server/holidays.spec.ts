import { beforeEach, describe, expect, it } from 'vitest';
import { auditLines } from '#lib/server/auditLog.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, players } from '#lib/server/db/schema.ts';
import {
	cancelHoliday,
	decideHoliday,
	getHoliday,
	requestHoliday,
	seasonUnlocks
} from '#lib/server/holidays.ts';
import type { Season } from '#lib/server/seasons.ts';
import {
	seedEntries,
	seedHoliday,
	seedMatch,
	seedPlayers,
	seedSeason
} from '#lib/server/test/seed.ts';

const range = { from: '2026-10-12', to: '2026-10-14' }; // week 2
let season: Season;

// In play: p1–p4 in one group, start 5 Oct, 2 rounds a week, rounds 1–3, rounds 1–2 published.
beforeEach(() => {
	seedPlayers(4);
	db.insert(players).values({ id: 'org', displayName: 'Org' }).run();
	season = seedSeason({
		status: 'play',
		startDate: '2026-10-05',
		roundsPerWeek: 2,
		publishedRound: 2,
		deadline: '2026-10-25'
	});
	seedEntries(season.id, ['p1', 'p2', 'p3', 'p4'], 1);
	for (const [round, p1Id, p2Id] of [
		[1, 'p1', 'p2'],
		[1, 'p3', 'p4'],
		[2, 'p1', 'p3'],
		[2, 'p2', 'p4'],
		[3, 'p1', 'p4'],
		[3, 'p2', 'p3']
	] as const)
		seedMatch({ seasonId: season.id, group: 1, round, p1Id, p2Id });
});

describe('holiday writes', () => {
	it('requestHoliday stores a pending request, unaudited', () => {
		const h = requestHoliday(season.id, 'p1', range);
		expect(h.status).toBe('pending');
		expect(db.select().from(audit).all()).toEqual([]);
	});

	it('cancelHoliday cancels only your own pending request, unaudited', () => {
		const h = requestHoliday(season.id, 'p1', range);
		expect(cancelHoliday(season.id, h.id, 'p2')).toBe(false);
		expect(cancelHoliday(season.id, h.id, 'p1')).toBe(true);
		expect(getHoliday(season.id, h.id)!.status).toBe('cancelled');
		expect(cancelHoliday(season.id, h.id, 'p1')).toBe(false);
		expect(db.select().from(audit).all()).toEqual([]);
	});

	it('decideHoliday records who and when and audits without the reason', () => {
		const h = requestHoliday(season.id, 'p1', range);
		decideHoliday(h, 'org', 'rejected', 'Ask a week ahead.');
		const row = getHoliday(season.id, h.id)!;
		expect(row).toMatchObject({
			status: 'rejected',
			decidedBy: 'org',
			reason: 'Ask a week ahead.'
		});
		expect(row.decidedAt).toBeInstanceOf(Date);
		const [a] = db.select().from(audit).all();
		expect(a).toMatchObject({
			action: 'holiday',
			actorId: 'org',
			matchId: null,
			after: { holiday: 'p1', ...range, status: 'rejected' }
		});
		expect(JSON.stringify(a)).not.toContain('Ask a week ahead');
	});

	it('seasonUnlocks: approved and revoked holidays of this season only', () => {
		const other = seedSeason({ slug: 's2', status: 'finished', startDate: '2026-10-05' });
		seedHoliday({ seasonId: season.id, playerId: 'p1', ...range, status: 'approved' });
		seedHoliday({ seasonId: season.id, playerId: 'p2', ...range, status: 'revoked' });
		seedHoliday({ seasonId: season.id, playerId: 'p3', ...range, status: 'pending' });
		seedHoliday({ seasonId: other.id, playerId: 'p4', ...range, status: 'approved' });
		const { unlocked, away } = seasonUnlocks(season);
		expect([...unlocked.keys()]).toEqual(['p1', 'p2']);
		expect([...unlocked.get('p1')!]).toEqual([2]);
		expect([...away.keys()]).toEqual(['p1']);
	});
});

describe('audit lines', () => {
	it('reads "Player 1 — holiday 12–14 Oct approved" for everyone', () => {
		decideHoliday(requestHoliday(season.id, 'p1', range), 'org', 'approved');
		const [l] = auditLines(season.id, { publishedRound: 0 });
		expect([l.label, l.what]).toEqual(['Holiday', 'Player 1 — holiday 12–14 Oct approved']);
	});
});
