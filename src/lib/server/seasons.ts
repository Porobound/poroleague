import { error } from '@sveltejs/kit';
import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { defaultGroupCount, splitGroups } from '#lib/league/groups.ts';
import { published } from '#lib/league/publish.ts';
import { buildSchedule } from '#lib/league/schedule.ts';
import { standings } from '#lib/league/standings.ts';
import { currentWeek, reportingClosed, roundsOfWeek, weekOf } from '#lib/league/time.ts';
import { seasonFields, seasonPhases, type SeasonFields, type SeasonStatus } from '#lib/season.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, entries, matches, players, seasons } from '#lib/server/db/schema.ts';
import { droppedIds } from '#lib/league/status.ts';
import { clearTiebreaks, playerMatches, seasonMatches, type Match } from '#lib/server/matches.ts';

export type Season = typeof seasons.$inferSelect;

// Every season lookup goes through this so soft-deleted seasons never show up.
const live = isNull(seasons.deletedAt);

export function getSeason(slug: string, viewer: App.Locals['user']): Season {
	const season = db
		.select()
		.from(seasons)
		.where(and(eq(seasons.slug, slug), live))
		.get();
	if (!season || (season.status === 'draft' && !viewer?.isOrganizer))
		error(404, 'Season not found');
	return season;
}

// Season sub-pages have nothing to show for a draft; only the season page previews drafts.
export function publicSeason(slug: string, viewer: App.Locals['user']): Season {
	const season = getSeason(slug, viewer);
	if (season.status === 'draft') error(404, 'Season not found');
	return season;
}

// Only one season runs (signup → play) at a time; drafts and finished seasons don't count.
export const runningSeason = (exceptId: number) =>
	db
		.select({ name: seasons.name, slug: seasons.slug })
		.from(seasons)
		.where(
			and(inArray(seasons.status, ['signup', 'groups', 'play']), ne(seasons.id, exceptId), live)
		)
		.get();

export const matchCount = (seasonId: number) =>
	db.select({ n: count() }).from(matches).where(eq(matches.seasonId, seasonId)).get()!.n;

// Soft delete: records who and when, and frees the slug ('~' can't appear in a real slug).
export function deleteSeason(season: Season, deletedBy: string) {
	db.update(seasons)
		.set({ deletedAt: new Date(), deletedBy, slug: `${season.slug}~deleted-${season.id}` })
		.where(eq(seasons.id, season.id))
		.run();
}

export const allSeasons = () =>
	db.select().from(seasons).where(live).orderBy(desc(seasons.id)).all();

export const latestSeason = (status: 'draft' | 'not-draft') =>
	db
		.select()
		.from(seasons)
		.where(
			and(status === 'draft' ? eq(seasons.status, 'draft') : ne(seasons.status, 'draft'), live)
		)
		.orderBy(desc(seasons.id))
		.limit(1)
		.get();

export const slugTaken = (slug: string, exceptId = -1) =>
	!!db
		.select({ id: seasons.id })
		.from(seasons)
		.where(and(eq(seasons.slug, slug), ne(seasons.id, exceptId)))
		.get();

export function createSeason(values: SeasonFields) {
	db.insert(seasons).values(values).run();
}

// Changes to a public season are audited; a draft is private and edited freely.
const AUDITED = ['name', 'startDate', 'roundsPerWeek', 'deadline', 'topCutSize'] as const;
export function updateSeason(season: Season, values: SeasonFields, actorId: string) {
	// Compare form-shaped values, so a NULL column the form fills with a default isn't a change.
	const before = seasonFields(season);
	const changed = AUDITED.filter((k) => before[k] !== values[k]);
	db.transaction((tx) => {
		tx.update(seasons).set(values).where(eq(seasons.id, season.id)).run();
		if (season.status === 'draft' || !changed.length) return;
		const pick = (o: SeasonFields) => Object.fromEntries(changed.map((k) => [k, o[k]]));
		tx.insert(audit)
			.values({
				seasonId: season.id,
				actorId,
				action: 'season',
				before: pick(before),
				after: pick(values)
			})
			.run();
	});
}

export function setStatus(id: number, status: SeasonStatus) {
	db.update(seasons).set({ status }).where(eq(seasons.id, id)).run();
}

export function seasonEntries(seasonId: number) {
	return db
		.select({
			playerId: players.id,
			displayName: players.displayName,
			avatar: players.avatar,
			former: sql<boolean>`${players.erasedAt} is not null`.mapWith(Boolean),
			group: entries.group,
			dropped: entries.dropped,
			tiebreak: entries.tiebreak
		})
		.from(entries)
		.innerJoin(players, eq(entries.playerId, players.id))
		.where(eq(entries.seasonId, seasonId))
		.orderBy(asc(players.displayName))
		.all();
}

export type SeasonEntry = ReturnType<typeof seasonEntries>[number];

export function addEntry(seasonId: number, playerId: string) {
	db.insert(entries).values({ seasonId, playerId }).onConflictDoNothing().run();
}

export function removeEntry(seasonId: number, playerId: string) {
	db.delete(entries)
		.where(and(eq(entries.seasonId, seasonId), eq(entries.playerId, playerId)))
		.run();
}

// Voids every match of the player (derived from `dropped`); kept in the DB, out of the standings.
export function dropPlayer(seasonId: number, playerId: string, actorId: string) {
	db.transaction((tx) => {
		tx.update(entries)
			.set({ dropped: true })
			.where(and(eq(entries.seasonId, seasonId), eq(entries.playerId, playerId)))
			.run();
		clearTiebreaks(tx, seasonId);
		tx.insert(audit)
			.values({ seasonId, actorId, action: 'drop', after: { dropped: playerId } })
			.run();
	});
}

// Fixes a mistaken drop: the player's matches count again.
export function cancelDrop(seasonId: number, playerId: string, actorId: string) {
	db.transaction((tx) => {
		tx.update(entries)
			.set({ dropped: false })
			.where(and(eq(entries.seasonId, seasonId), eq(entries.playerId, playerId)))
			.run();
		clearTiebreaks(tx, seasonId);
		tx.insert(audit)
			.values({ seasonId, actorId, action: 'undrop', after: { undropped: playerId } })
			.run();
	});
}

export function setTiebreaks(seasonId: number, order: string[], actorId: string) {
	db.transaction((tx) => {
		order.forEach((playerId, i) =>
			tx
				.update(entries)
				.set({ tiebreak: i + 1 })
				.where(and(eq(entries.seasonId, seasonId), eq(entries.playerId, playerId)))
				.run()
		);
		tx.insert(audit).values({ seasonId, actorId, action: 'tiebreak', after: { order } }).run();
	});
}

export function finalizeSeason(seasonId: number, actorId: string) {
	db.transaction((tx) => {
		tx.update(seasons).set({ status: 'finished' }).where(eq(seasons.id, seasonId)).run();
		tx.insert(audit).values({ seasonId, actorId, action: 'finalize' }).run();
	});
}

export function publishWeek(
	seasonId: number,
	week: number,
	rounds: [number, number],
	actorId: string
) {
	db.transaction((tx) => {
		tx.update(seasons).set({ publishedRound: rounds[1] }).where(eq(seasons.id, seasonId)).run();
		tx.insert(audit)
			.values({ seasonId, actorId, action: 'publish', after: { week, rounds } })
			.run();
	});
}

export function setGroup(seasonId: number, playerId: string, group: number) {
	db.update(entries)
		.set({ group })
		.where(and(eq(entries.seasonId, seasonId), eq(entries.playerId, playerId)))
		.run();
}

// Back to signup: clears the draw so people can join or withdraw again; closing signup redraws.
export function reopenSignup(seasonId: number) {
	db.transaction((tx) => {
		tx.update(entries).set({ group: null }).where(eq(entries.seasonId, seasonId)).run();
		tx.update(seasons).set({ status: 'signup' }).where(eq(seasons.id, seasonId)).run();
	});
}

export function drawGroups(seasonId: number) {
	const ids = seasonEntries(seasonId).map((e) => e.playerId);
	const groups = splitGroups(ids, defaultGroupCount(ids.length));
	db.transaction(() => groups.forEach((g, i) => g.forEach((id) => setGroup(seasonId, id, i + 1))));
}

// Entries split by group number (1-based); index 0 is group 1.
export function groupsOf(list: SeasonEntry[]): SeasonEntry[][] {
	const count = Math.max(0, ...list.map((e) => e.group ?? 0));
	return Array.from({ length: count }, (_, i) => list.filter((e) => e.group === i + 1));
}

export function lockGroups(seasonId: number) {
	const groups = groupsOf(seasonEntries(seasonId)).map((g) => g.map((e) => e.playerId));
	const schedule = buildSchedule(groups);
	db.transaction((tx) => {
		tx.insert(matches)
			.values(
				schedule.map((m) => ({ seasonId, group: m.group, round: m.round, p1Id: m.p1, p2Id: m.p2 }))
			)
			.run();
		tx.update(seasons).set({ status: 'play' }).where(eq(seasons.id, seasonId)).run();
	});
}

export function groupStandings(
	season: Season,
	list: SeasonEntry[],
	all: Match[] = seasonMatches(season.id)
) {
	const closed = reportingClosed(season.deadline, new Date());
	return groupsOf(list).map((g, i) => {
		const by = new Map(g.map((e) => [e.playerId, e]));
		const ms = all.filter((m) => m.group === i + 1);
		const results = ms.map((m) => ({
			p1: m.p1Id,
			p2: m.p2Id,
			p1Games: m.p1Games,
			p2Games: m.p2Games
		}));
		return {
			group: i + 1,
			size: g.length,
			rounds: Math.max(0, ...ms.map((m) => m.round)),
			dropped: g.filter((e) => e.dropped),
			rows: standings(g, results, closed).map((r) => ({
				...r,
				name: by.get(r.playerId)!.displayName,
				avatar: by.get(r.playerId)!.avatar,
				former: by.get(r.playerId)!.former
			}))
		};
	});
}
export type GroupStanding = ReturnType<typeof groupStandings>[number];

// Where the season stands this week, for the phase bar and the week headline.
export function seasonProgress(season: Season, groups: GroupStanding[], now = new Date()) {
	const closed = reportingClosed(season.deadline, now);
	const week = currentWeek(season.startDate, now);
	const maxRound = Math.max(0, ...groups.map((g) => g.rounds));
	const weeks = weekOf(maxRound, season.roundsPerWeek);
	const rounds = roundsOfWeek(week, season.roundsPerWeek, maxRound);
	const sizes = groups.map((g) => g.size);
	return {
		closed,
		week,
		weeks,
		rounds,
		phases: seasonPhases(season, { week, weeks, rounds, groups: sizes, closed })
	};
}

// The header links your name to your player page: the season being viewed if you're in it,
// else your newest season.
export function myPlayerPage(playerId: string, slug?: string) {
	const s = db
		.select({ slug: seasons.slug })
		.from(entries)
		.innerJoin(seasons, eq(entries.seasonId, seasons.id))
		.where(and(eq(entries.playerId, playerId), ne(seasons.status, 'draft'), live))
		.orderBy(desc(sql`${seasons.slug} = ${slug ?? ''}`), desc(seasons.id))
		.limit(1)
		.get();
	return s ? `/seasons/${s.slug}/players/${playerId}` : null;
}

// Every public season a player entered, newest first, with their final or current place.
// ponytail: standings per season; fine for a handful of seasons a year.
export function playerSeasons(playerId: string) {
	return db
		.select({ season: seasons })
		.from(entries)
		.innerJoin(seasons, eq(entries.seasonId, seasons.id))
		.where(and(eq(entries.playerId, playerId), ne(seasons.status, 'draft'), live))
		.orderBy(desc(seasons.id))
		.all()
		.map(({ season }) => {
			const list = seasonEntries(season.id);
			const me = list.find((e) => e.playerId === playerId)!;
			const g = groupStandings(season, list).find((g) => g.group === me.group);
			const i = g?.rows.findIndex((r) => r.playerId === playerId) ?? -1;
			return {
				season,
				me,
				row: g && i >= 0 ? g.rows[i] : null,
				rank: i + 1,
				size: g?.size ?? 0,
				matches: published(playerMatches(season.id, playerId), season.publishedRound),
				dropped: droppedIds(list)
			};
		});
}
export type PlayerSeason = ReturnType<typeof playerSeasons>[number];

// One line per season for the player and career pages.
export const seasonHistory = (list: PlayerSeason[]) =>
	list.map(({ season, me, row, rank, size }) => ({
		slug: season.slug,
		name: season.name,
		group: me.group,
		dropped: me.dropped,
		place: row?.played ? `#${rank} of ${size}` : '—',
		points: row?.played ? `${row.points} pts` : '—',
		record: row?.played ? `${row.wins}–${row.draws}–${row.losses}` : '—'
	}));
