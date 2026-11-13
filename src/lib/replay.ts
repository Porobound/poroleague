// RiftAtlas replay files ("riftatlas-replay" version 2). The game is a table of nodes, each
// ['o', [key, value][]] or ['a', value[]], where a value is a primitive or a {r: index} reference.

import { LEGENDS } from '#lib/legends.ts';

export const MAX_REPLAY_BYTES = 5 * 1024 * 1024;
export const TOO_BIG = 'A replay file can be 5 MB at most.';

export type ReplayInfo = {
	replayId: string;
	game: number; // 1-based game of the series
	legends: [string, string]; // champion names
	completedAt: number; // ms
};

const NOT_REPLAY =
	"This isn't a RiftAtlas replay file. Download the replay JSON from RiftAtlas and upload that.";
const DAMAGED = 'This replay file is damaged or incomplete.';

const bad = (error: string) => ({ ok: false as const, error });

export function readReplay(text: string): { ok: true; info: ReplayInfo } | ReturnType<typeof bad> {
	let file;
	try {
		file = JSON.parse(text);
	} catch {
		return bad(NOT_REPLAY);
	}
	if (file?.format !== 'riftatlas-replay' || !Array.isArray(file.nodes)) return bad(NOT_REPLAY);
	if (file.version !== 2)
		return bad(
			"This replay uses a RiftAtlas file version the league doesn't know yet. Tell an organizer."
		);
	// Follows one reference; anything off in the file throws below and reads as damaged.
	const get = (ref: any): any => {
		const [kind, body] = file.nodes[ref.r];
		return kind === 'o' ? Object.fromEntries(body) : body;
	};
	try {
		const root = get(file.root);
		const state = get(get(get(root.frames).at(-1)).state);
		const players: unknown[] = get(state.players);
		if (players.length !== 2) return bad('A league replay has exactly two players.');
		const legends = players.map((p) => {
			const zone: any[] = get(get(get(p).board).legend).map(get);
			return (zone.find((c) => c.type === 'legend') ?? zone[0]).name.split(',')[0];
		});
		const info = {
			replayId: root.replayId,
			game: state.gameNumber,
			legends,
			completedAt: root.completedAt
		};
		if (
			typeof info.replayId !== 'string' ||
			!info.replayId ||
			!Number.isInteger(info.game) ||
			info.game < 1 ||
			typeof info.completedAt !== 'number' ||
			!legends.every((l) => l)
		)
			return bad(DAMAGED);
		return { ok: true, info: info as ReplayInfo };
	} catch {
		return bad(DAMAGED);
	}
}

// "Kai'Sa" and "Kai’Sa" are one legend, and the league tells Master Yi's two apart: "Master Yi (PG)".
const champion = (legend: string) =>
	legend
		.replace(/\(.*\)/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
const KNOWN = new Set(LEGENDS.map(champion));

export type Reported = {
	p1Games: number | null;
	p2Games: number | null;
	games: string | null;
	p1Legend: string | null;
	p2Legend: string | null;
};

// Why this replay can't belong to this match, or null. `since`: nothing older can be a league game.
export function checkReplay(info: ReplayInfo, m: Reported, now: Date, since: Date): string | null {
	if (m.p1Games === null || m.p2Games === null) return 'Report the result first.';
	const played = m.games?.length ?? m.p1Games + m.p2Games;
	if (info.game > played)
		return `This is the replay of game ${info.game}, but the match was reported with ${played} ${played === 1 ? 'game' : 'games'}.`;
	const pair = (a: string, b: string) => [champion(a), champion(b)].sort().join();
	// Only names the league knows can contradict the result: RiftAtlas in another language, or a
	// legend it names differently, must not block a real replay.
	if (
		m.p1Legend &&
		m.p2Legend &&
		info.legends.every((l) => KNOWN.has(champion(l))) &&
		pair(...info.legends) !== pair(m.p1Legend, m.p2Legend)
	)
		return `This replay is ${info.legends.join(' vs ')}, but the match was reported as ${m.p1Legend} vs ${m.p2Legend}.`;
	// Five minutes of clock difference between RiftAtlas and here is fine.
	if (info.completedAt > now.getTime() + 5 * 60_000) return 'This replay is dated in the future.';
	if (info.completedAt < since.getTime()) return 'This replay is older than the season.';
	return null;
}
