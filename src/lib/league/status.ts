import { weekOf } from './time';

export const droppedIds = (people: { playerId: string; dropped: boolean }[]) =>
	new Set(people.filter((p) => p.dropped).map((p) => p.playerId));

// A match is void once either player is dropped (spec: Drops).
export const isVoid = (m: { p1Id: string; p2Id: string }, dropped: Set<string>) =>
	dropped.has(m.p1Id) || dropped.has(m.p2Id);

// Overdue: unreported, not void, from an earlier week, while it can still be reported. After the
// deadline an unplayed match is a double loss instead.
export const isOverdue = (
	m: { round: number; reportedBy: string | null },
	c: { roundsPerWeek: number; week: number; inPlay: boolean; closed: boolean; voided: boolean }
) =>
	!m.reportedBy && !c.voided && c.inPlay && !c.closed && weekOf(m.round, c.roundsPerWeek) < c.week;
