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
