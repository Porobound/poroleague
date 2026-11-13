// A minimal RiftAtlas replay file, in the real node-table encoding, for tests.
export function replayFile(
	o: {
		game?: number;
		legends?: string[]; // card names, "Champion, Title"
		replayId?: string;
		completedAt?: number;
		frames?: number;
		version?: number;
	} = {}
) {
	const nodes: unknown[] = [];
	const put = (v: unknown): unknown => {
		if (v === null || typeof v !== 'object') return v;
		nodes.push(
			Array.isArray(v) ? ['a', v.map(put)] : ['o', Object.entries(v).map(([k, x]) => [k, put(x)])]
		);
		return { r: nodes.length - 1 };
	};
	const legends = o.legends ?? ['Azir, Emperor of the Sands', "Evelynn, Agony's Embrace"];
	const state = {
		gameNumber: o.game ?? 1,
		players: legends.map((name) => ({ board: { legend: [{ name }] } }))
	};
	const root = put({
		replayId: o.replayId ?? `ROOM:${o.game ?? 1}`,
		completedAt: o.completedAt ?? Date.now() - 60_000,
		frames: Array.from({ length: o.frames ?? 2 }, () => ({ state }))
	});
	return JSON.stringify({ format: 'riftatlas-replay', version: o.version ?? 2, nodes, root });
}
