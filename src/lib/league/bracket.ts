export const MAX_CUT = 32;

export const bracketSize = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

// Standard order: first-round pair i holds order[2i] and order[2i + 1]. 1 meets the last seed, and
// 1 and 2 can only meet in the final.
export function seedOrder(size: number): number[] {
	let order = [1, 2];
	while (order.length < size) {
		const n = order.length * 2;
		order = order.flatMap((s) => [s, n + 1 - s]);
	}
	return order;
}

// `groups` holds each group's qualifiers best first, all the same length. Seeds go A1, B1, C1, A2…
// Returns the first round as slots (pair i = slots 2i, 2i + 1; null = bye). Two players of one group
// never meet in the first round: the lower seed swaps with the nearest seed that clears the clash.
export function drawBracket(groups: string[][]): (string | null)[] {
	const seeds = groups[0].flatMap((_, r) => groups.map((g) => g[r]));
	const seedNo = new Map(seeds.map((id, i) => [id, i]));
	const group = new Map(groups.flatMap((g, i) => g.map((id) => [id, i] as const)));
	const tier = (id: string) => Math.floor(seedNo.get(id)! / groups.length);
	const slots = seedOrder(bracketSize(seeds.length)).map((s) => seeds[s - 1] ?? null);
	if (groups.length < 2) return slots;

	const mate = (i: number) => i ^ 1;
	const paired = (i: number) => slots[i] !== null && slots[mate(i)] !== null;
	const clash = (i: number) => paired(i) && group.get(slots[i]!) === group.get(slots[mate(i)]!);
	const swap = (i: number, j: number) => ([slots[i], slots[j]] = [slots[j], slots[i]]);
	for (let i = 0; i < slots.length; i += 2) {
		if (!clash(i)) continue;
		const low = seedNo.get(slots[i]!)! > seedNo.get(slots[i + 1]!)! ? i : i + 1;
		const id = slots[low]!;
		// ponytail: O(n²) over at most 32 slots.
		const j = slots
			.map((_, j) => j)
			.filter((j) => j !== low && j !== mate(low) && paired(j))
			.sort(
				(a, b) =>
					Math.abs(tier(slots[a]!) - tier(id)) - Math.abs(tier(slots[b]!) - tier(id)) ||
					Math.abs(seedNo.get(slots[a]!)! - seedNo.get(id)!) -
						Math.abs(seedNo.get(slots[b]!)! - seedNo.get(id)!)
			)
			.find((j) => {
				swap(low, j);
				const ok = !clash(low) && !clash(j);
				swap(low, j);
				return ok;
			});
		if (j === undefined) throw new Error('No first round without a group rematch');
		swap(low, j);
	}
	return slots;
}

export type CutMatch = {
	round: number;
	slot: number | null;
	p1Id: string;
	p2Id: string;
	p1Games: number | null;
	p2Games: number | null;
	reportedBy: string | null;
	walkoverId: string | null;
};

// A level result sends the higher seed (lower number) through.
export function winnerOf(m: CutMatch, seedOf: (id: string) => number): string | null {
	if (m.walkoverId) return m.walkoverId;
	if (!m.reportedBy) return null;
	if (m.p1Games! !== m.p2Games!) return m.p1Games! > m.p2Games! ? m.p1Id : m.p2Id;
	return seedOf(m.p1Id) < seedOf(m.p2Id) ? m.p1Id : m.p2Id;
}

export type Slot<M extends CutMatch> = {
	round: number;
	slot: number;
	p1: string | null;
	p2: string | null;
	bye: boolean;
	match: M | null;
	winner: string | null;
};

// The whole bracket from the first-round layout and the playoff rows. A row only counts while it
// still holds the slot's players (an edit upstream repoints it; see syncBracket).
export function bracket<M extends CutMatch>(
	layout: (string | null)[],
	ms: M[],
	seedOf: (id: string) => number
): Slot<M>[][] {
	const rounds: Slot<M>[][] = [];
	let entrants = layout;
	for (let round = 1; entrants.length > 1; round++) {
		const slots = Array.from({ length: entrants.length / 2 }, (_, slot): Slot<M> => {
			const [p1, p2] = [entrants[2 * slot], entrants[2 * slot + 1]];
			// Only the first round has byes; later an empty side means that match isn't decided yet.
			const bye = round === 1 && (p1 === null) !== (p2 === null);
			const row = ms.find((m) => m.round === round && m.slot === slot) ?? null;
			const match = row && row.p1Id === p1 && row.p2Id === p2 ? row : null;
			const winner = bye ? (p1 ?? p2) : match ? winnerOf(match, seedOf) : null;
			return { round, slot, p1, p2, bye, match, winner };
		});
		rounds.push(slots);
		entrants = slots.map((s) => s.winner);
	}
	return rounds;
}

const left = (round: number, rounds: number) => 2 ** (rounds - round + 1);

export function roundName(round: number, rounds: number) {
	const n = left(round, rounds);
	return n === 2 ? 'Final' : n === 4 ? 'Semifinals' : n === 8 ? 'Quarterfinals' : `Round of ${n}`;
}

export function matchName(round: number, slot: number, rounds: number) {
	const n = left(round, rounds);
	if (n === 2) return 'Final';
	if (n === 4 || n === 8) return `${n === 4 ? 'Semifinal' : 'Quarterfinal'} ${slot + 1}`;
	return `Round of ${n} · ${slot + 1}`;
}

// "A1" = 1st in Group A. Seeds run A1, B1, …, A2, B2, … so the place is the seed's tier.
export const seedLabel = (seed: number, groups: number) =>
	`${String.fromCharCode(65 + ((seed - 1) % groups))}${Math.ceil(seed / groups)}`;

// How far a player got: Champion, Runner-up, or the round they went out in; null outside the cut.
export function cutFinish(rounds: Slot<CutMatch>[][], playerId: string): string | null {
	const mine = rounds.flat().filter((s) => s.p1 === playerId || s.p2 === playerId);
	if (!mine.length) return null;
	const last = mine[mine.length - 1];
	if (last.winner === playerId) return last.round === rounds.length ? 'Champion' : null;
	if (last.round === rounds.length) return last.winner ? 'Runner-up' : null;
	if (!last.winner) return null;
	const n = left(last.round, rounds.length);
	return n === 4 ? 'Semifinal' : n === 8 ? 'Quarterfinal' : `Round of ${n}`;
}
