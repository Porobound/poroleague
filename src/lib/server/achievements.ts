import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
	ACHIEVEMENTS,
	type Achievement,
	evaluate,
	type History,
	type Tier
} from '#lib/league/achievements.ts';
import { mastery, portrait } from '#lib/league/mastery.ts';
import type { Rank } from '#lib/league/ranks.ts';
import { standings } from '#lib/league/standings.ts';
import { leagueDate } from '#lib/league/time.ts';
import * as schema from '#lib/server/db/schema.ts';

const { audit, entries, matches, playerAchievements, players, seasons } = schema;

// Takes the db instead of importing it, so the node dev scripts (no $app/env) can run it too.
export type Db = BetterSQLite3Database<typeof schema>;

export function playerHistory(db: Db, playerId: string): History {
	const mine = db
		.select({
			id: seasons.id,
			publishedRound: seasons.publishedRound,
			topCutSize: seasons.topCutSize,
			slot: entries.slot,
			group: entries.group
		})
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
	// The player's final place in their group: the standings as they stand once it is finalized,
	// unplayed matches counted as the double losses they became.
	const group = (s: (typeof mine)[number]) => {
		if (s.group === null || !at(s.id, 'finalize')) return null;
		const list = db
			.select({ playerId: entries.playerId, dropped: entries.dropped, tiebreak: entries.tiebreak })
			.from(entries)
			.where(and(eq(entries.seasonId, s.id), eq(entries.group, s.group)))
			.all();
		const results = db
			.select({
				p1: matches.p1Id,
				p2: matches.p2Id,
				p1Games: matches.p1Games,
				p2Games: matches.p2Games
			})
			.from(matches)
			.where(
				and(eq(matches.seasonId, s.id), eq(matches.stage, 'group'), eq(matches.group, s.group))
			)
			.all();
		const rows = standings(list, results, true);
		const place = rows.findIndex((r) => r.playerId === playerId) + 1;
		return place
			? { place, of: rows.length, first: rows[0].playerId, cut: s.topCutSize ?? 0 }
			: null;
	};
	// In the final of a finished top cut: the playoff match of the last round.
	const finalAt = (seasonId: number) => {
		const done = at(seasonId, 'champion');
		if (!done) return null;
		const [last] = db
			.select({ p1Id: matches.p1Id, p2Id: matches.p2Id })
			.from(matches)
			.where(and(eq(matches.seasonId, seasonId), eq(matches.stage, 'playoff')))
			.orderBy(desc(matches.round))
			.limit(1)
			.all();
		return last && (last.p1Id === playerId || last.p2Id === playerId) ? done : null;
	};
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
			),
			finalAt: finalAt(s.id),
			group: group(s)
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
			const h = playerHistory(tx, playerId);
			const rows = evaluate(h).flatMap((p) =>
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
export type Kind = 'legend' | 'rank' | 'item'; // champion portrait, rank emblem, item icon
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
// A legend's mastery on the career page: its rank, the matches behind it and what comes next.
export type MasteryView = {
	legend: string;
	icon: string;
	matches: number;
	rank: Rank | null;
	earned: string | null; // league date the rank was reached
	next: { rank: Rank; need: number } | null; // null at the top rank
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
	comeback: 'Comeback',
	wins: 'Wins',
	streak: 'Streak',
	matches: 'Matches'
};
const kind = (a: Achievement): Kind =>
	a.legend ? 'legend' : a.icon.startsWith('/achievements/tiers/') ? 'rank' : 'item';

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
	const h = playerHistory(db, playerId);
	const have = new Map(evaluate(h).map((p) => [p.id, p.have]));
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
			name: LEAGUE_TRACKS[track],
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
	return {
		earned: ACHIEVEMENTS.filter((a) => earned.has(a.id)).length,
		// Legends the player has played, most played first.
		legends: mastery(h)
			.filter((m) => m.matches)
			.sort((a, b) => b.matches - a.matches || a.legend.localeCompare(b.legend))
			.map((m): MasteryView => ({
				legend: m.legend,
				icon: portrait(m.legend),
				matches: m.matches,
				rank: m.rank,
				earned: m.hit ? leagueDate(m.hit.at) : null,
				next: m.next
			})),
		league: tracks,
		ones
	};
}
export type Career = ReturnType<typeof careerAchievements>;
