import type { MatchResult } from './standings';

export const START = 1500;
const K = 32;

// Plain Elo over matches in the order they were played; margin ignored, any equal score a draw.
// Ratings stay unrounded so the pool stays zero-sum.
export function ratings(matches: (MatchResult & { p1Games: number; p2Games: number })[]) {
	const r = new Map<string, number>();
	for (const m of matches) {
		const a = r.get(m.p1) ?? START;
		const b = r.get(m.p2) ?? START;
		const score = m.p1Games > m.p2Games ? 1 : m.p1Games < m.p2Games ? 0 : 0.5;
		const delta = K * (score - 1 / (1 + 10 ** ((b - a) / 400)));
		r.set(m.p1, a + delta);
		r.set(m.p2, b - delta);
	}
	return r;
}
