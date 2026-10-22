import { and, asc, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { Report } from '#lib/league/report.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, players } from '#lib/server/db/schema.ts';

export type Match = typeof matches.$inferSelect;
export type Player = typeof players.$inferSelect;

export const getMatch = (seasonId: number, id: number) =>
	db
		.select()
		.from(matches)
		.where(and(eq(matches.id, id), eq(matches.seasonId, seasonId)))
		.get();

export function matchPlayers(m: Match): [Player, Player] {
	const list = db
		.select()
		.from(players)
		.where(inArray(players.id, [m.p1Id, m.p2Id]))
		.all();
	const by = (id: string) => list.find((p) => p.id === id)!;
	return [by(m.p1Id), by(m.p2Id)];
}

export const playerMatches = (seasonId: number, playerId: string) =>
	db
		.select()
		.from(matches)
		.where(
			and(
				eq(matches.seasonId, seasonId),
				or(eq(matches.p1Id, playerId), eq(matches.p2Id, playerId))
			)
		)
		.orderBy(asc(matches.round))
		.all();

// A match is void once either player is dropped (spec: Drops).
export const isVoided = (m: Match) =>
	!!db
		.select({ playerId: entries.playerId })
		.from(entries)
		.where(
			and(
				eq(entries.seasonId, m.seasonId),
				inArray(entries.playerId, [m.p1Id, m.p2Id]),
				eq(entries.dropped, true)
			)
		)
		.get();

// Pre-fills the report form: the legend the player last reported with, in any season.
export function lastLegend(playerId: string): string | null {
	const m = db
		.select({ p1Id: matches.p1Id, p1Legend: matches.p1Legend, p2Legend: matches.p2Legend })
		.from(matches)
		.where(
			and(or(eq(matches.p1Id, playerId), eq(matches.p2Id, playerId)), isNotNull(matches.reportedAt))
		)
		.orderBy(desc(matches.reportedAt))
		.limit(1)
		.get();
	if (!m) return null;
	return m.p1Id === playerId ? m.p1Legend : m.p2Legend;
}

const result = (m: Match) => ({
	p1Games: m.p1Games,
	p2Games: m.p2Games,
	p1Legend: m.p1Legend,
	p2Legend: m.p2Legend,
	diceWinnerId: m.diceWinnerId
});

// First report or the reporter's edit; the result and its audit row are written together.
export function saveReport(m: Match, actorId: string, values: Report): 'report' | 'edit' {
	const action = m.reportedBy ? 'edit' : 'report';
	db.transaction((tx) => {
		tx.update(matches)
			.set({ ...values, reportedBy: m.reportedBy ?? actorId, reportedAt: new Date() })
			.where(eq(matches.id, m.id))
			.run();
		tx.insert(audit)
			.values({
				seasonId: m.seasonId,
				matchId: m.id,
				actorId,
				action,
				before: m.reportedBy ? result(m) : null,
				after: values
			})
			.run();
	});
	return action;
}

export function flagMatch(m: Match, actorId: string, reason: string) {
	db.transaction((tx) => {
		tx.update(matches)
			.set({ flaggedBy: actorId, flagReason: reason })
			.where(eq(matches.id, m.id))
			.run();
		tx.insert(audit)
			.values({
				seasonId: m.seasonId,
				matchId: m.id,
				actorId,
				action: 'flag',
				before: null,
				after: { flagReason: reason }
			})
			.run();
	});
}
