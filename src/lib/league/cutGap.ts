// Where a player stands against the top-cut line: inside it and by how many points clear of the
// first player outside, or outside it and by how many points short of the last player inside.
// `rows` are one group's standings in order, without anyone who can't qualify (dropped or erased
// players), the same list the top cut is drawn from. Null when there is no line to speak of: no
// cut, a cut that takes everyone, nothing played yet, or a player who isn't in the rows.
export function cutGap(
	rows: { playerId: string; points: number; played: number }[],
	playerId: string,
	cut: number
) {
	if (cut <= 0 || cut >= rows.length || !rows.some((r) => r.played)) return null;
	const i = rows.findIndex((r) => r.playerId === playerId);
	if (i < 0) return null;
	return i < cut
		? { inside: true, points: rows[i].points - rows[cut].points }
		: { inside: false, points: rows[cut - 1].points - rows[i].points };
}
