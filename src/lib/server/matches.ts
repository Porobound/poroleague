import { and, asc, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { MatchPost } from '#lib/discord.ts';
import { matchName } from '#lib/league/bracket.ts';
import type { Report } from '#lib/league/report.ts';
import { isVoid } from '#lib/league/status.ts';
import { cardContext, matchCard } from '#lib/matchCard.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, former, matches, players } from '#lib/server/db/schema.ts';
import { groupName } from '#lib/season.ts';
import { cutRounds, syncBracket } from '#lib/server/topCut.ts';

export type Match = typeof matches.$inferSelect;
export type Player = ReturnType<typeof matchPlayers>[number];

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Organizer tie ranks only order the ties of the standings they were set on, so any result change
// clears them and the organizer confirms the order again.
export const clearTiebreaks = (tx: Tx, seasonId: number) =>
	tx.update(entries).set({ tiebreak: null }).where(eq(entries.seasonId, seasonId)).run();

export const getMatch = (seasonId: number, id: number) =>
	db
		.select()
		.from(matches)
		.where(and(eq(matches.id, id), eq(matches.seasonId, seasonId)))
		.get();

// What match pages and posts need; never the Discord id.
export function matchPlayers(m: Match) {
	const list = db
		.select({
			id: players.id,
			displayName: players.displayName,
			avatar: players.avatar,
			former: former()
		})
		.from(players)
		.where(inArray(players.id, [m.p1Id, m.p2Id]))
		.all();
	const by = (id: string) => list.find((p) => p.id === id)!;
	return [by(m.p1Id), by(m.p2Id)] as const;
}

export const playerMatches = (seasonId: number, playerId: string) =>
	db
		.select()
		.from(matches)
		.where(
			and(
				eq(matches.seasonId, seasonId),
				eq(matches.stage, 'group'),
				or(eq(matches.p1Id, playerId), eq(matches.p2Id, playerId))
			)
		)
		.orderBy(asc(matches.round))
		.all();

export const seasonMatches = (seasonId: number) =>
	db
		.select()
		.from(matches)
		.where(and(eq(matches.seasonId, seasonId), eq(matches.stage, 'group')))
		.orderBy(asc(matches.group), asc(matches.round), asc(matches.id))
		.all();

export const bracketMatches = (seasonId: number) =>
	db
		.select()
		.from(matches)
		.where(and(eq(matches.seasonId, seasonId), eq(matches.stage, 'playoff')))
		.orderBy(asc(matches.round), asc(matches.slot))
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
		if (m.stage === 'group') clearTiebreaks(tx, m.seasonId);
		tx.insert(audit)
			.values({ seasonId: m.seasonId, matchId: m.id, actorId, action: 'report', after: values })
			.run();
		if (m.stage === 'playoff') syncBracket(tx, { id: m.seasonId });
	});
}

export const resultOf = (m: Match): Report | null =>
	m.reportedBy
		? {
				games: m.games,
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
		where:
			match.stage === 'playoff'
				? `${season.name} · Top cut · ${matchName(match.round, match.slot ?? 0, cutRounds(match.seasonId))}`
				: `${season.name}${group} · Round ${match.round}`,
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
				walkoverId: null,
				...(m.reportedBy ? {} : { reportedBy: actorId, reportedAt: now }),
				...(m.flaggedBy && !m.flagResolvedAt
					? { flagResolvedBy: actorId, flagResolvedAt: now }
					: {})
			})
			.where(eq(matches.id, m.id))
			.run();
		if (m.stage === 'group') clearTiebreaks(tx, m.seasonId);
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
		if (m.stage === 'playoff') syncBracket(tx, { id: m.seasonId });
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
			actorFormer: former(),
			group: matches.group,
			round: matches.round,
			stage: matches.stage,
			slot: matches.slot,
			p1Id: matches.p1Id,
			p2Id: matches.p2Id
		})
		.from(audit)
		.innerJoin(players, eq(audit.actorId, players.id))
		.leftJoin(matches, eq(audit.matchId, matches.id))
		.where(eq(audit.seasonId, seasonId))
		.orderBy(desc(audit.id))
		.all();

// Rows for the organizer's match tools: card props, open flag, and the edit form's pre-fill.
export function adminRows(
	season: Parameters<typeof cardContext>[0],
	people: Parameters<typeof cardContext>[1],
	ms: Match[]
) {
	const ctx = cardContext(season, people, null);
	const name = (id: string) => ctx.people.get(id)?.displayName ?? 'Unknown';
	return ms.map((m) => {
		const { status, props } = matchCard(m, ctx);
		return {
			id: m.id,
			round: m.round,
			group: m.group,
			status,
			card: props,
			reported: !!m.reportedBy,
			// An organizer entered it (players only report their own matches).
			entered: !!m.reportedBy && m.reportedBy !== m.p1Id && m.reportedBy !== m.p2Id,
			p1: { id: m.p1Id, name: name(m.p1Id) },
			p2: { id: m.p2Id, name: name(m.p2Id) },
			// A null reason was removed when the flagging player was erased.
			flag: status === 'flagged' ? { by: name(m.flaggedBy!), reason: m.flagReason } : null,
			// ponytail: lastLegend is 2 queries per unreported match; fine at league size (~150 matches).
			values: {
				game1: m.games?.[0] ?? '',
				game2: m.games?.[1] ?? '',
				game3: m.games?.[2] ?? '',
				p1Legend: m.p1Legend ?? lastLegend(m.p1Id) ?? '',
				p2Legend: m.p2Legend ?? lastLegend(m.p2Id) ?? '',
				dice: m.diceWinnerId ?? ''
			}
		};
	});
}
export type AdminRow = ReturnType<typeof adminRows>[number];
