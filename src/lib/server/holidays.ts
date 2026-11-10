import { and, asc, eq } from 'drizzle-orm';
import { date, dateSpan } from '#lib/format.ts';
import {
	awayWeeks,
	revokedWeeks,
	coversLabel,
	holidayWeeks,
	isUnlocked,
	unlockedWeeks,
	type Range
} from '#lib/league/holiday.ts';
import { isVoid } from '#lib/league/status.ts';
import { leagueDate, weekOf } from '#lib/league/time.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, former, holidays, players } from '#lib/server/db/schema.ts';
import type { Match } from '#lib/server/matches.ts';
import type { Season } from '#lib/server/seasons.ts';

export type HolidayRow = typeof holidays.$inferSelect;

export const seasonHolidays = (seasonId: number) =>
	db
		.select({ h: holidays, name: players.displayName, avatar: players.avatar, former: former() })
		.from(holidays)
		.innerJoin(players, eq(holidays.playerId, players.id))
		.where(eq(holidays.seasonId, seasonId))
		.orderBy(asc(holidays.id))
		.all()
		.map(({ h, ...p }) => ({ ...h, ...p }));
export type SeasonHoliday = ReturnType<typeof seasonHolidays>[number];

export const getHoliday = (seasonId: number, id: number) =>
	db
		.select()
		.from(holidays)
		.where(and(eq(holidays.id, id), eq(holidays.seasonId, seasonId)))
		.get();

// Which weeks are unlocked (approved or revoked), who is away (approved) and whose holiday was
// revoked, per player.
export function seasonUnlocks(
	season: { id: number; startDate: string | null },
	list: SeasonHoliday[] = seasonHolidays(season.id)
) {
	const start = season.startDate ?? '9999-12-31';
	return {
		unlocked: unlockedWeeks(list, start),
		away: awayWeeks(list, start),
		revoked: revokedWeeks(list, start)
	};
}

// Pending requests and cancels aren't audited.
export const requestHoliday = (seasonId: number, playerId: string, r: Range) =>
	db.insert(holidays).values({ seasonId, playerId, from: r.from, to: r.to }).returning().get();

export const cancelHoliday = (seasonId: number, id: number, playerId: string) =>
	db
		.update(holidays)
		.set({ status: 'cancelled' })
		.where(
			and(
				eq(holidays.id, id),
				eq(holidays.seasonId, seasonId),
				eq(holidays.playerId, playerId),
				eq(holidays.status, 'pending')
			)
		)
		.run().changes > 0;

// Approve, reject or revoke, with its public audit row. The reason stays off the audit row.
// False, with nothing written, if the holiday changed since `h` was read.
export function decideHoliday(
	h: HolidayRow,
	actorId: string,
	status: 'approved' | 'rejected' | 'revoked',
	reason?: string
) {
	return db.transaction((tx) => {
		const { changes } = tx
			.update(holidays)
			.set({
				status,
				decidedBy: actorId,
				decidedAt: new Date(),
				...(status === 'rejected' ? { reason: reason || null } : {})
			})
			.where(and(eq(holidays.id, h.id), eq(holidays.status, h.status)))
			.run();
		if (!changes) return false;
		tx.insert(audit)
			.values({
				seasonId: h.seasonId,
				actorId,
				action: 'holiday',
				after: { holiday: h.playerId, from: h.from, to: h.to, status }
			})
			.run();
		return true;
	});
}

// Admin → Season → Holidays: requests waiting for a decision, and who is away.
export function holidayAdmin(season: Season, all: Match[], dropped: Set<string>) {
	const list = seasonHolidays(season.id);
	const maxRound = Math.max(0, ...all.map((m) => m.round));
	const cal = { startDate: season.startDate ?? '', roundsPerWeek: season.roundsPerWeek, maxRound };
	const { unlocked } = seasonUnlocks(season, list);
	const row = (h: SeasonHoliday) => ({
		id: h.id,
		player: {
			name: h.name,
			avatar: h.avatar,
			former: h.former,
			href: `/seasons/${season.slug}/players/${h.playerId}`
		},
		away: dateSpan(h.from, h.to),
		covers: coversLabel(holidayWeeks(h, cal), season.roundsPerWeek, maxRound),
		asked: date(leagueDate(h.createdAt))
	});
	return {
		pending: list.filter((h) => h.status === 'pending').map(row),
		approved: list
			.filter((h) => h.status === 'approved')
			.map((h) => {
				// The matches this holiday unlocked that are still unpublished: how many are played.
				const weeks = holidayWeeks(h, cal);
				const early = all.filter(
					(m) =>
						(m.p1Id === h.playerId || m.p2Id === h.playerId) &&
						weeks.includes(weekOf(m.round, season.roundsPerWeek)) &&
						!isVoid(m, dropped) &&
						isUnlocked(m, season, unlocked)
				);
				return {
					...row(h),
					early: `${early.filter((m) => m.reportedBy).length} of ${early.length} played`,
					decided: h.decidedAt ? date(leagueDate(h.decidedAt)) : ''
				};
			})
	};
}
