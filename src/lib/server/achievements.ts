import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
	ACHIEVEMENTS,
	evaluate,
	kind,
	type Kind,
	type History,
	type Tier
} from '#lib/league/achievements.ts';
import { leagueDate } from '#lib/league/time.ts';
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

// What the career page draws. A track is one row: its icon at the highest earned tier, a pip per
// tier, and progress towards the first tier not yet earned.
export type TierView = {
	id: string;
	name: string;
	description: string;
	tier: Tier;
	need: number;
	earned: string | null; // league date it unlocked
};
export type TrackView = {
	track: string;
	name: string;
	kind: Kind;
	icon: string;
	tier: Tier | null; // highest earned
	tiers: TierView[];
	next: { have: number; need: number; name: string } | null; // null once complete
};
export type OneView = {
	id: string;
	name: string;
	description: string;
	icon: string;
	earned: string | null;
};
const LEAGUE_TRACKS: Record<string, string> = {
	variety: 'Variety',
	dice: 'Dice',
	seasons: 'Seasons',
	comeback: 'Comeback'
};

// The career page's Achievements: earned from the table (award-only), progress derived now.
export function careerAchievements(db: Db, playerId: string) {
	const earned = new Map(
		db
			.select()
			.from(playerAchievements)
			.where(eq(playerAchievements.playerId, playerId))
			.all()
			.map((r) => [r.achievementId, leagueDate(r.unlockedAt)])
	);
	const have = new Map(evaluate(playerHistory(db, playerId)).map((p) => [p.id, p.have]));
	const tracks: TrackView[] = [];
	const ones: OneView[] = [];
	for (const [track, defs] of Map.groupBy(ACHIEVEMENTS, (a) => a.track)) {
		const [first] = defs;
		if (!first.tier) {
			const { id, name, description, icon } = first;
			ones.push({ id, name, description, icon, earned: earned.get(id) ?? null });
			continue;
		}
		const top = defs.findLast((a) => earned.has(a.id));
		const next = defs.find((a) => !earned.has(a.id));
		tracks.push({
			track,
			name: first.legend ?? LEAGUE_TRACKS[track],
			kind: kind(first),
			icon: (top ?? first).icon,
			tier: top?.tier ?? null,
			tiers: defs.map((a) => ({
				id: a.id,
				name: a.name,
				description: a.description,
				tier: a.tier!,
				need: a.need,
				earned: earned.get(a.id) ?? null
			})),
			next: next ? { have: have.get(next.id)!, need: next.need, name: next.name } : null
		});
	}
	const started = (t: TrackView) => !!t.tier || t.next!.have > 0;
	// Matches played as the legend, as far as the top tier counts them.
	const played = (t: TrackView) => have.get(t.tiers.at(-1)!.id)!;
	return {
		earned: ACHIEVEMENTS.filter((a) => earned.has(a.id)).length,
		// Tracks still in progress first, then finished ones; most played first within each.
		legends: tracks
			.filter((t) => t.kind === 'legend' && started(t))
			.sort((a, b) => +!a.next - +!b.next || played(b) - played(a) || a.name.localeCompare(b.name)),
		league: tracks.filter((t) => t.track in LEAGUE_TRACKS),
		ones
	};
}
export type Career = ReturnType<typeof careerAchievements>;
