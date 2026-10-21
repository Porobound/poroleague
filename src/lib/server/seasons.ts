import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { defaultGroupCount, splitGroups } from '#lib/league/groups.ts';
import { buildSchedule } from '#lib/league/schedule.ts';
import type { SeasonFields, SeasonStatus } from '#lib/season.ts';
import { db } from '#lib/server/db/index.ts';
import { entries, matches, players, seasons } from '#lib/server/db/schema.ts';

export type Season = typeof seasons.$inferSelect;

export function getSeason(slug: string, viewer: App.Locals['user']): Season {
	const season = db.select().from(seasons).where(eq(seasons.slug, slug)).get();
	if (!season || (season.status === 'draft' && !viewer?.isOrganizer))
		error(404, 'Season not found');
	return season;
}

export const allSeasons = () => db.select().from(seasons).orderBy(desc(seasons.id)).all();

export const latestSeason = (status: 'draft' | 'not-draft') =>
	db
		.select()
		.from(seasons)
		.where(status === 'draft' ? eq(seasons.status, 'draft') : ne(seasons.status, 'draft'))
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

export function updateSeason(id: number, values: SeasonFields) {
	db.update(seasons).set(values).where(eq(seasons.id, id)).run();
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
			group: entries.group
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
