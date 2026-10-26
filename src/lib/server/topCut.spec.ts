import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, seasons } from '#lib/server/db/schema.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';
import { flagMatch, organizerEdit, saveReport } from '#lib/server/matches.ts';
import { erasePlayer } from '#lib/server/players.ts';
import { load as cutPage } from '../../routes/seasons/[slug]/top-cut/+page.server.ts';
import { load as matchPage } from '../../routes/seasons/[slug]/matches/[id]/+page.server.ts';
import { auditLines } from '#lib/server/auditLog.ts';
import { playerSeasons, seasonHistory } from '#lib/server/seasons.ts';
import {
	cutPreview,
	cutState,
	finishCut,
	nextPlayed,
	publishCut,
	waitingOnFlag,
	walkover
} from './topCut.ts';

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
const slot = (round: number, s: number) => cutState(season()).rounds[round - 1][s];

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

	it('skips erased players, so the next one moves up', () => {
		erasePlayer('p2', 'p1');
		const ids = cutPreview(season()).firstRound.flatMap((m) => [m.p1?.id, m.p2?.id]);
		expect(ids).not.toContain('p2');
		expect(ids).toContain('p3');
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

	it('a flagged result holds the next match; flagging closes once it is played', () => {
		const page = (m: { id: number }, playerId: string) =>
			matchPage({
				params: { slug: 's1', id: String(m.id) },
				locals: { user: { id: playerId, displayName: playerId, avatar: null, isOrganizer: false } }
			} as never) as unknown as { mode: string; waiting: boolean; settled: boolean };
		saveReport(slot(1, 0).match!, 'p1', won(2, 0));
		flagMatch(slot(1, 0).match!, 'p5', 'It was the other way round.');
		saveReport(slot(1, 1).match!, 'p4', won(2, 0));
		expect(waitingOnFlag(season(), slot(2, 0).match!)).toBe(true);
		expect(page(slot(2, 0).match!, 'p1')).toMatchObject({ mode: 'view', waiting: true });

		organizerEdit(slot(1, 0).match!, 'p1', won(0, 2));
		expect(waitingOnFlag(season(), slot(2, 0).match!)).toBe(false);
		expect(page(slot(2, 0).match!, 'p5')).toMatchObject({ mode: 'report', waiting: false });

		expect(page(slot(1, 1).match!, 'p2')).toMatchObject({ mode: 'flag', settled: false });
		saveReport(slot(2, 0).match!, 'p5', won(2, 0));
		expect(page(slot(1, 1).match!, 'p2')).toMatchObject({ mode: 'view', settled: true });
	});

	it('a walkover page names who advances and is not void', () => {
		walkover(season(), slot(1, 0).match!, 'p5', 'p1');
		expect(
			matchPage({
				params: { slug: 's1', id: String(slot(1, 0).match!.id) },
				locals: { user: null }
			} as never)
		).toMatchObject({ walkover: 'Player 5', voided: false });
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

describe('audit lines', () => {
	it('logs publishing, walkovers and the champion', () => {
		publishCut(season(), '2026-12-05', 'p1');
		walkover(season(), slot(1, 0).match!, 'p1', 'p1');
		walkover(season(), slot(1, 1).match!, 'p4', 'p1');
		walkover(season(), slot(2, 0).match!, 'p1', 'p1');
		finishCut(season(), 'p1', 'p1');
		expect(auditLines(id).map((l) => [l.label, l.what])).toEqual([
			['Champion', 'Champion: Player 1'],
			['Walkover', 'Final · Player 1 vs Player 4 · Player 1 advances'],
			['Walkover', 'Semifinal 2 · Player 4 vs Player 2 · Player 4 advances'],
			['Walkover', 'Semifinal 1 · Player 1 vs Player 5 · Player 1 advances'],
			['Top cut', 'Top cut published · 4 players · 5 Dec 2026']
		]);
	});
});

describe('top cut page', () => {
	const view = () =>
		cutPage({ params: { slug: 's1' }, locals: { user: null } } as never) as ReturnType<
			typeof cutPage
		> & {
			rounds: { name: string; slots: { p1: { name: string; label: string } | null }[] }[];
		};
	it('404s until published, then shows rounds with seed labels', () => {
		expect(() => view()).toThrow();
		publishCut(season(), null, 'p1');
		expect(view().rounds.map((r) => r.name)).toEqual(['Semifinals', 'Final']);
		expect(view().rounds[0].slots[0].p1).toMatchObject({ name: 'Player 1', label: 'A1' });
	});
});

describe('history', () => {
	it('names each player’s top-cut finish', () => {
		publishCut(season(), null, 'p1');
		walkover(season(), slot(1, 0).match!, 'p1', 'p1');
		walkover(season(), slot(1, 1).match!, 'p4', 'p1');
		walkover(season(), slot(2, 0).match!, 'p1', 'p1');
		const cut = (p: string) => seasonHistory(playerSeasons(p))[0].cut;
		expect(['p1', 'p4', 'p5', 'p3'].map(cut)).toEqual(['Champion', 'Runner-up', 'Semifinal', null]);
	});
});
