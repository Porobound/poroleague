import { and, asc, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { MatchPost } from '#lib/discord.ts';
import type { Report } from '#lib/league/report.ts';
import { isVoid } from '#lib/league/status.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, players } from '#lib/server/db/schema.ts';
import { groupName } from '#lib/season.ts';

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

export const seasonMatches = (seasonId: number) =>
	db
		.select()
		.from(matches)
		.where(eq(matches.seasonId, seasonId))
		.orderBy(asc(matches.group), asc(matches.round), asc(matches.id))
		.all();

export const isVoided = (m: Match) =>
	isVoid(
		m,
		new Set(
			db
				.select({ playerId: entries.playerId })
				.from(entries)
				.where(
					and(
						eq(entries.seasonId, m.seasonId),
						inArray(entries.playerId, [m.p1Id, m.p2Id]),
						eq(entries.dropped, true)
					)
				)
				.all()
				.map((e) => e.playerId)
		)
	);

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

// A report is final (fixes go through a flag); the result and its audit row are written together.
export function saveReport(m: Match, actorId: string, values: Report) {
	db.transaction((tx) => {
		tx.update(matches)
			.set({ ...values, reportedBy: actorId, reportedAt: new Date() })
			.where(eq(matches.id, m.id))
			.run();
		tx.insert(audit)
			.values({ seasonId: m.seasonId, matchId: m.id, actorId, action: 'report', after: values })
			.run();
	});
}

export const resultOf = (m: Match): Report | null =>
	m.reportedBy
		? {
				p1Games: m.p1Games!,
				p2Games: m.p2Games!,
				p1Legend: m.p1Legend!,
				p2Legend: m.p2Legend!,
				diceWinnerId: m.diceWinnerId!
			}
		: null;

export function matchPost(
	origin: string,
	season: { name: string; slug: string },
	match: Match,
	report: Report
): MatchPost {
	const [p1, p2] = matchPlayers(match);
	const group = match.group ? ` · ${groupName(match.group)}` : '';
	return {
		p1: { id: p1.id, name: p1.displayName },
		p2: { id: p2.id, name: p2.displayName },
		report,
		where: `${season.name}${group} · Round ${match.round}`,
		url: `${origin}/seasons/${season.slug}/matches/${match.id}`,
		at: new Date()
	};
}

// Organizer fix or entry. Resolves an open flag; an unreported match gets the organizer as reporter.
export function organizerEdit(m: Match, actorId: string, values: Report) {
	const now = new Date();
	db.transaction((tx) => {
		tx.update(matches)
			.set({
				...values,
				...(m.reportedBy ? {} : { reportedBy: actorId, reportedAt: now }),
				...(m.flaggedBy && !m.flagResolvedAt
					? { flagResolvedBy: actorId, flagResolvedAt: now }
					: {})
			})
			.where(eq(matches.id, m.id))
			.run();
		tx.insert(audit)
			.values({
				seasonId: m.seasonId,
				matchId: m.id,
				actorId,
				action: 'edit',
				before: resultOf(m),
				after: values
			})
			.run();
	});
}

export function keepResult(m: Match, actorId: string) {
	db.transaction((tx) => {
		tx.update(matches)
			.set({ flagResolvedBy: actorId, flagResolvedAt: new Date() })
			.where(eq(matches.id, m.id))
			.run();
		tx.insert(audit)
			.values({
				seasonId: m.seasonId,
				matchId: m.id,
				actorId,
				action: 'resolve',
				after: resultOf(m)
			})
			.run();
	});
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

export const seasonAudit = (seasonId: number) =>
	db
		.select({
			id: audit.id,
			action: audit.action,
			before: audit.before,
			after: audit.after,
			createdAt: audit.createdAt,
			actor: players.displayName,
			group: matches.group,
			round: matches.round,
			p1Id: matches.p1Id,
			p2Id: matches.p2Id
		})
		.from(audit)
		.innerJoin(players, eq(audit.actorId, players.id))
		.leftJoin(matches, eq(audit.matchId, matches.id))
		.where(eq(audit.seasonId, seasonId))
		.orderBy(desc(audit.id))
		.all();
