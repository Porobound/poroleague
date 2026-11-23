import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ACHIEVEMENTS, evaluate, type History } from '#lib/league/achievements.ts';
import { mastery, portrait } from '#lib/league/mastery.ts';
import { compareRank, RANK_NAME, type Rank } from '#lib/league/ranks.ts';
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

// What the career page draws: one row per achievement. A track is one row, at the level reached.
export type AchievementView = {
	key: string; // the track
	name: string; // of the level reached, or of the first one while locked
	description: string;
	icon: string;
	rank: Rank;
	earned: string | null; // league date that level unlocked
	season: { slug: string; name: string } | null; // where it was earned, while that season is public
	level: number; // levels earned
	levels: number;
	next: { have: number; need: number; name: string } | null; // null once complete
};
// A legend's mastery on the career page: its rank, the matches behind it and what comes next.
export type MasteryView = {
	legend: string;
	icon: string;
	matches: number;
	rank: Rank | null;
	earned: string | null; // league date the rank was reached
	season: { slug: string; name: string } | null; // where, while that season is public
	next: { rank: Rank; need: number } | null; // null at the top rank
};

// The career page's Achievements: earned from the table (award-only), progress derived now.
export function careerAchievements(db: Db, playerId: string) {
	const got = new Map(
		db
			.select()
			.from(playerAchievements)
			.where(eq(playerAchievements.playerId, playerId))
			.all()
			.map((r) => [r.achievementId, r])
	);
	// A deleted or draft season isn't linked, as the API doesn't name it either.
	const where = new Map(
		db
			.select({ id: seasons.id, slug: seasons.slug, name: seasons.name })
			.from(seasons)
			.where(and(isNull(seasons.deletedAt), ne(seasons.status, 'draft')))
			.all()
			.map((s) => [s.id, s])
	);
	const h = playerHistory(db, playerId);
	const have = new Map(evaluate(h).map((p) => [p.id, p.have]));
	const list = [...Map.groupBy(ACHIEVEMENTS, (a) => a.track)].map(
		([key, defs]): AchievementView => {
			const top = defs.findLast((a) => got.has(a.id));
			const next = defs.find((a) => !got.has(a.id));
			const shown = top ?? defs[0];
			const row = top ? got.get(top.id)! : null;
			const s = row?.seasonId != null ? where.get(row.seasonId) : undefined;
			return {
				key,
				name: shown.name,
				description: shown.description,
				icon: shown.icon,
				rank: shown.rank,
				earned: row ? leagueDate(row.unlockedAt) : null,
				season: s ? { slug: s.slug, name: s.name } : null,
				level: defs.filter((a) => got.has(a.id)).length,
				levels: defs.length,
				next: next ? { have: have.get(next.id)!, need: next.need, name: next.name } : null
			};
		}
	);
	// Earned first, highest rank on top, newest first within a rank; then what is under way; then
	// the rest, easiest rank first.
	const started = (a: AchievementView) => +!!a.next?.have;
	list.sort((a, b) =>
		a.earned && b.earned
			? compareRank(b.rank, a.rank) || b.earned.localeCompare(a.earned)
			: +!!b.earned - +!!a.earned || started(b) - started(a) || compareRank(a.rank, b.rank)
	);
	return {
		earned: list.filter((a) => a.earned).length,
		total: list.length,
		list,
		// Every legend, played or not, most played first.
		legends: mastery(h)
			.sort((a, b) => b.matches - a.matches || a.legend.localeCompare(b.legend))
			.map((m): MasteryView => {
				const s = m.hit ? where.get(m.hit.seasonId) : undefined;
				return {
					legend: m.legend,
					icon: portrait(m.legend),
					matches: m.matches,
					rank: m.rank,
					earned: m.hit ? leagueDate(m.hit.at) : null,
					season: s ? { slug: s.slug, name: s.name } : null,
					next: m.next
				};
			})
	};
}
export type Career = ReturnType<typeof careerAchievements>;

// The strip on the season player page: the highest-ranked achievements and legends, as medals,
// and how many more there are behind each row.
const SHOWCASE = 7;
export function showcase(c: Career) {
	const earned = c.list.filter((a) => a.earned); // already highest rank first
	const ranked = c.legends
		.filter((m) => m.rank)
		.sort((a, b) => compareRank(b.rank!, a.rank!) || b.matches - a.matches);
	return {
		achievements: earned
			.slice(0, SHOWCASE)
			.map(({ name, description, icon, rank }) => ({ name, description, icon, rank })),
		moreAchievements: Math.max(0, earned.length - SHOWCASE),
		mastery: ranked.slice(0, SHOWCASE).map((m) => ({
			name: `${m.legend} · ${RANK_NAME[m.rank!]}`,
			description: `${m.matches} ${m.matches === 1 ? 'match' : 'matches'} as ${m.legend}.`,
			icon: m.icon,
			rank: m.rank!
		})),
		moreMastery: Math.max(0, ranked.length - SHOWCASE)
	};
}
export type Showcase = ReturnType<typeof showcase>;
