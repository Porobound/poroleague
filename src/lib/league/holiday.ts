import { isPublished } from '#lib/league/publish.ts';
import { addDays, roundsOfWeek, weekOf, weekOn } from '#lib/league/time.ts';

export const HOLIDAY_STATUSES = [
	'pending',
	'approved',
	'rejected',
	'cancelled',
	'revoked'
] as const;
export type HolidayStatus = (typeof HOLIDAY_STATUSES)[number];
export type Range = { from: string; to: string };
export type Holiday = Range & { playerId: string; status: HolidayStatus };
// Player id → weeks.
export type WeekMap = Map<string, Set<number>>;
type Calendar = { startDate: string; roundsPerWeek: number; maxRound: number };

const MAX_DAYS = 28;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Month 13 doesn't parse at all, and addDays throws on it.
const isDate = (d: string) =>
	ISO.test(d) && !isNaN(Date.parse(`${d}T12:00:00Z`)) && addDays(d, 0) === d;

// Weeks the range overlaps that have rounds (any week from 1 on without a schedule).
export function holidayWeeks(r: Range, c: Calendar | { startDate: string }) {
	const last = 'maxRound' in c ? weekOf(c.maxRound, c.roundsPerWeek) : Infinity;
	const first = Math.max(1, weekOn(c.startDate, r.from));
	const end = Math.min(last, weekOn(c.startDate, r.to));
	return Array.from({ length: Math.max(0, end - first + 1) }, (_, i) => first + i);
}

const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
// "weeks 4–5 (rounds 7–10)"; weeks are consecutive.
export function coversLabel(weeks: number[], roundsPerWeek: number, maxRound: number) {
	if (!weeks.length) return '';
	const [a, b] = [weeks[0], weeks.at(-1)!];
	const r1 = roundsOfWeek(a, roundsPerWeek, maxRound)![0];
	const r2 = roundsOfWeek(b, roundsPerWeek, maxRound)![1];
	return `${a === b ? 'week' : 'weeks'} ${span(a, b)} (${r1 === r2 ? 'round' : 'rounds'} ${span(r1, r2)})`;
}

const OPEN: HolidayStatus[] = ['pending', 'approved'];
// The first limit a request breaks, or null. Checked in this order.
export function requestError(
	r: Range,
	c: Calendar & { publishedRound: number; deadline: string | null; today: string },
	own: (Range & { status: HolidayStatus })[]
): string | null {
	if (!isDate(r.from) || !isDate(r.to)) return 'Pick the first and last day you’re away.';
	if (r.to < r.from) return 'The last day is before the first.';
	if (r.from < c.today) return 'The first day can’t be in the past.';
	if (addDays(r.from, MAX_DAYS - 1) < r.to) return 'A holiday can be at most 4 weeks.';
	if (c.deadline && r.to > c.deadline) return 'Pick dates up to the season deadline.';
	const open = holidayWeeks(r, c).filter(
		(w) => roundsOfWeek(w, c.roundsPerWeek, c.maxRound)![1] > c.publishedRound
	);
	if (!open.length) return 'Those dates don’t cover a week that’s still to be published.';
	if (own.some((h) => OPEN.includes(h.status) && h.from <= r.to && r.from <= h.to))
		return 'You already asked for a holiday on some of those days.';
	return null;
}

function weekMap(hs: Holiday[], statuses: HolidayStatus[], startDate: string): WeekMap {
	const map: WeekMap = new Map();
	for (const h of hs.filter((h) => statuses.includes(h.status))) {
		const set = map.get(h.playerId) ?? new Set();
		for (const w of holidayWeeks(h, { startDate })) set.add(w);
		map.set(h.playerId, set);
	}
	return map;
}
// A revoke removes the badge but can't un-leak a pairing, so revoked holidays keep unlocking.
export const unlockedWeeks = (hs: Holiday[], startDate: string) =>
	weekMap(hs, ['approved', 'revoked'], startDate);
export const awayWeeks = (hs: Holiday[], startDate: string) => weekMap(hs, ['approved'], startDate);

type M = { stage?: string; round: number; p1Id: string; p2Id: string };
type S = { publishedRound: number; roundsPerWeek: number };

// Unpublished, and a player of it is on an approved (or since revoked) holiday that week.
export const isUnlocked = (m: M, s: S, unlocked: WeekMap) =>
	!isPublished(m, s.publishedRound) &&
	[m.p1Id, m.p2Id].some((id) => unlocked.get(id)?.has(weekOf(m.round, s.roundsPerWeek)));

// Who may see a match (pairing and result): everyone once published; before that, only its two
// players, and only if a holiday unlocked it. Organizers get the same via isUnlocked on admin pages.
export const visibleTo = (m: M, viewerId: string | null, s: S, unlocked: WeekMap) =>
	isPublished(m, s.publishedRound) ||
	(!!viewerId && (m.p1Id === viewerId || m.p2Id === viewerId) && isUnlocked(m, s, unlocked));
