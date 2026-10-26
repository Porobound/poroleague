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
import { playerSeasons, seasonHistory, seasonProgress } from '#lib/server/seasons.ts';
import { cutPreview, cutState, finishCut, publishCut, waitingOnFlag, walkover } from './topCut.ts';

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

	const page = (m: { id: number }, playerId: string) =>
		matchPage({
			params: { slug: 's1', id: String(m.id) },
			locals: { user: { id: playerId, displayName: playerId, avatar: null, isOrganizer: false } }
		} as never) as unknown as { mode: string; waiting: boolean };

	it('an edit that changes the winner clears and repoints the matches after it', () => {
		saveReport(slot(1, 0).match!, 'p1', won(2, 0)); // p1 beats p5
		walkover(season(), slot(1, 1).match!, 'p2', 'p1');
		saveReport(slot(2, 0).match!, 'p1', won(2, 0)); // p1 beats p2 in the final
		expect(cutState(season()).champion).toBe('p1');

		// The loser can still flag the semi, and the organizer's fix moves the final on.
		expect(page(slot(1, 0).match!, 'p5').mode).toBe('flag');
		flagMatch(slot(1, 0).match!, 'p5', 'It was the other way round.');
		organizerEdit(slot(1, 0).match!, 'p1', won(0, 2));
		const final = slot(2, 0);
		expect([final.p1, final.p2]).toEqual(['p5', 'p2']);
		expect(final.match).toMatchObject({ reportedBy: null, p1Games: null });
		expect(cutState(season()).champion).toBeNull();

		// The log keeps who played the cleared final.
		const lines = auditLines(id).map((l) => l.what);
		expect(lines).toContain(
			'Final · Player 1 vs Player 2 · Result cleared: an earlier top-cut result changed'
		);
		expect(lines.find((l) => l.startsWith('Final · Player 1 2–0 Player 2'))).toBeTruthy();
	});

	it('an edit that keeps the winner leaves the next match alone', () => {
		saveReport(slot(1, 0).match!, 'p1', won(2, 0));
		walkover(season(), slot(1, 1).match!, 'p2', 'p1');
		saveReport(slot(2, 0).match!, 'p1', won(2, 0));
		organizerEdit(slot(1, 0).match!, 'p1', won(2, 1));
		expect(slot(2, 0).match).toMatchObject({ reportedBy: 'p1' });
	});

	it('a flagged result holds the next match until it is settled', () => {
		saveReport(slot(1, 0).match!, 'p1', won(2, 0));
		flagMatch(slot(1, 0).match!, 'p5', 'It was the other way round.');
		saveReport(slot(1, 1).match!, 'p4', won(2, 0));
		expect(waitingOnFlag(season(), slot(2, 0).match!)).toBe(true);
		expect(page(slot(2, 0).match!, 'p1')).toMatchObject({ mode: 'view', waiting: true });

		organizerEdit(slot(1, 0).match!, 'p1', won(0, 2));
		expect(waitingOnFlag(season(), slot(2, 0).match!)).toBe(false);
		expect(page(slot(2, 0).match!, 'p5')).toMatchObject({ mode: 'report', waiting: false });
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

describe('three rounds', () => {
	// Top 3 per group: 6 players in a bracket of 8, A1 and B1 get byes.
	beforeEach(() => {
		db.update(seasons).set({ topCutSize: 3 }).run();
		publishCut(season(), null, 'p1');
	});

	it('an early edit clears every later match that depended on it', () => {
		const report = (round: number, s: number, p1: number, p2: number) =>
			saveReport(slot(round, s).match!, slot(round, s).p1!, won(p1, p2));
		report(1, 1, 2, 0);
		report(1, 3, 2, 0);
		report(2, 0, 0, 2); // the quarterfinal winner beats A1
		report(2, 1, 2, 0);
		report(3, 0, 2, 0);
		const semiWinner = slot(2, 0).winner;
		expect(cutState(season()).champion).toBe(semiWinner);

		organizerEdit(slot(1, 1).match!, 'p1', won(0, 2));
		expect(slot(2, 0).match).toMatchObject({ reportedBy: null });
		expect(slot(3, 0).p1).toBeNull();
		const oldFinal = db.select().from(matches).where(eq(matches.round, 3)).get()!;
		expect(oldFinal.reportedBy).toBeNull();
		expect(cutState(season()).champion).toBeNull();
		expect(
			db
				.select()
				.from(audit)
				.all()
				.filter((a) => a.action === 'reset')
		).toHaveLength(2);
	});
});

describe('phase bar', () => {
	it('names the top cut step for every page that shows it', () => {
		const step = () => seasonProgress(season(), []).phases.at(-1)!;
		expect(step()).toMatchObject({ state: 'current', detail: 'Being set up' });
		publishCut(season(), null, 'p1');
		expect(step().detail).toBe('Semifinals');
		walkover(season(), slot(1, 0).match!, 'p1', 'p1');
		walkover(season(), slot(1, 1).match!, 'p4', 'p1');
		walkover(season(), slot(2, 0).match!, 'p1', 'p1');
		expect(step().detail).toBe('Done');
	});
});
