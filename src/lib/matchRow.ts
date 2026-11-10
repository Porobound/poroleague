import type { Card } from '#lib/matchCard.ts';

// Flags are an organizer concern: a flagged match reads like any reported one.
const played = (c: Card) =>
	(c.status === 'reported' || c.status === 'flagged') &&
	c.props.sides.every((s) => s.games !== null);
const chips = (c: Card) =>
	c.props.sides.some((s) => s.tag === 'Holiday revoked')
		? ['Holiday revoked']
		: c.early
			? ['Early']
			: [];
const onHoliday = (tag: string | null) => (tag === 'On holiday' ? tag : null);
const canReport = (c: Card) => c.props.link.label === 'Report';

// Player A, centre slot, player B: the schedule and the bracket.
export function vsRow(c: Card) {
	const done = played(c);
	const [a, b] = c.props.sides.map((s) => s.games ?? 0);
	const best = done && a !== b ? (a > b ? 0 : 1) : null;
	const side = (i: 0 | 1) => {
		const s = c.props.sides[i];
		return {
			name: s.name,
			avatar: s.avatar,
			former: s.former,
			legend: done ? s.legend : null,
			tag: onHoliday(s.tag),
			you: c.you === i,
			dice: done && c.props.dice === i,
			result: best === null ? null : best === i ? ('won' as const) : ('lost' as const)
		};
	};
	return {
		id: c.id,
		href: c.props.link.href,
		mine: c.mine,
		void: c.status === 'void',
		sides: [side(0), side(1)] as [ReturnType<typeof side>, ReturnType<typeof side>],
		score: done ? ([a, b] as [number, number]) : null,
		mid: done
			? null
			: c.status === 'void'
				? 'Void'
				: c.walkover
					? 'W/O'
					: canReport(c)
						? 'Report'
						: 'vs',
		note: c.status === 'overdue' ? `Week ${c.week}` : c.walkover ? `${c.walkover} advances` : null,
		warn: c.status === 'overdue',
		chips: chips(c)
	};
}
export type VsRow = ReturnType<typeof vsRow>;

// One player's matches, read from their side: round, opponent, played as, dice, result.
export function povRow(c: Card, playerId: string) {
	const i = c.ids[1] === playerId ? 1 : 0;
	const me = c.props.sides[i];
	const opp = c.props.sides[1 - i];
	const done = played(c);
	const score = done ? ([me.games ?? 0, opp.games ?? 0] as [number, number]) : null;
	return {
		id: c.id,
		href: c.props.link.href,
		void: c.status === 'void',
		round: c.round,
		opponent: {
			name: opp.name,
			avatar: opp.avatar,
			former: opp.former,
			legend: done ? opp.legend : null,
			tag: onHoliday(opp.tag)
		},
		legend: done ? me.legend : null,
		dice: done && c.props.dice === i,
		overdue: c.status === 'overdue',
		score,
		letter: !score
			? null
			: score[0] > score[1]
				? ('W' as const)
				: score[0] < score[1]
					? ('L' as const)
					: ('D' as const),
		text: score
			? null
			: c.status === 'void'
				? 'Void'
				: c.walkover
					? 'Walkover'
					: canReport(c)
						? 'Report'
						: typeof c.round === 'number'
							? `Week ${c.week}`
							: null,
		chips: chips(c)
	};
}
export type PovRow = ReturnType<typeof povRow>;
