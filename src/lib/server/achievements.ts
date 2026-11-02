import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { evaluate, type History } from '#lib/league/achievements.ts';
import * as schema from '#lib/server/db/schema.ts';

const { audit, entries, matches, playerAchievements, players, seasons } = schema;

// Takes the db instead of importing it, so the node dev scripts (no $app/env) can run it too.
export type Db = BetterSQLite3Database<typeof schema>;

export function playerHistory(db: Db, playerId: string): History {
	const mine = db
		.select({ id: seasons.id, publishedRound: seasons.publishedRound, slot: entries.slot })
		.from(entries)
		.innerJoin(seasons, eq(entries.seasonId, seasons.id))
		.where(
			and(eq(entries.playerId, playerId), isNull(seasons.deletedAt), ne(seasons.status, 'draft'))
		)
		.all();
	const ids = mine.map((s) => s.id);
	if (!ids.length) return { playerId, matches: [], seasons: [] };
	const dropped = db
		.select({ seasonId: entries.seasonId, playerId: entries.playerId })
		.from(entries)
		.where(and(inArray(entries.seasonId, ids), eq(entries.dropped, true)))
		.all();
	const events = db
		.select({
			seasonId: audit.seasonId,
			action: audit.action,
			after: audit.after,
			at: audit.createdAt
		})
		.from(audit)
		.where(
			and(inArray(audit.seasonId, ids), inArray(audit.action, ['finalize', 'topcut', 'champion']))
		)
		.all();
	const at = (seasonId: number, action: string, ok = (_after: unknown) => true) =>
		events.find((e) => e.seasonId === seasonId && e.action === action && ok(e.after))?.at ?? null;
	return {
		playerId,
		matches: db
			.select()
			.from(matches)
			.where(
				and(
					inArray(matches.seasonId, ids),
					or(eq(matches.p1Id, playerId), eq(matches.p2Id, playerId))
				)
			)
			.all(),
		seasons: mine.map((s) => ({
			id: s.id,
			publishedRound: s.publishedRound,
			dropped: new Set(dropped.filter((d) => d.seasonId === s.id).map((d) => d.playerId)),
			finalizedAt: at(s.id, 'finalize'),
			cutAt: s.slot === null ? null : at(s.id, 'topcut'),
			championAt: at(
				s.id,
				'champion',
				(a) => (a as { champion?: string } | null)?.champion === playerId
			)
		}))
	};
}

// A failed award must never fail the result write before it or the server start: it's logged,
// and the next start's backfill retries it.
function safely(what: string, fn: () => void) {
	try {
		fn();
	} catch (e) {
		console.error(`Achievement award failed (${what}):`, e);
	}
}

function award(db: Db, playerIds: string[]) {
	db.transaction((tx) => {
		for (const playerId of new Set(playerIds)) {
			const rows = evaluate(playerHistory(tx, playerId)).flatMap((p) =>
				p.hit
					? [{ playerId, achievementId: p.id, unlockedAt: p.hit.at, seasonId: p.hit.seasonId }]
					: []
			);
			if (rows.length) tx.insert(playerAchievements).values(rows).onConflictDoNothing().run();
		}
	});
}

// The award entry points: insert what each player has newly earned and never remove anything
// (award-only), so they're safe after any write and on every start. One insert per player keeps
// it under SQLite's variable limit. They never throw.
// ponytail: rebuilds each player's history; fine at league size.
export const awardAchievements = (db: Db, playerIds: string[]) =>
	safely('players', () => award(db, playerIds));

export const awardSeason = (db: Db, seasonId: number) =>
	safely(`season ${seasonId}`, () =>
		award(
			db,
			db
				.select({ id: entries.playerId })
				.from(entries)
				.where(eq(entries.seasonId, seasonId))
				.all()
				.map((e) => e.id)
		)
	);

export const backfillAchievements = (db: Db) =>
	safely('backfill', () =>
		award(
			db,
			db
				.select({ id: players.id })
				.from(players)
				.all()
				.map((p) => p.id)
		)
	);
