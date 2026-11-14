import { describe, expect, it } from 'vitest';
import { checkReplay, readReplay, type ReplayInfo, type Reported } from '#lib/replay.ts';
import { replayFile } from '#lib/server/test/replayFile.ts';

const error = (text: string) => {
	const r = readReplay(text);
	return r.ok ? null : r.error;
};

describe('readReplay', () => {
	it('reads the game, legends, id and end time', () => {
		const r = readReplay(replayFile({ game: 2, replayId: 'R:2', completedAt: 1000 }));
		expect(r).toEqual({
			ok: true,
			info: {
				replayId: 'R:2',
				game: 2,
				legends: ['Azir', 'Evelynn'],
				completedAt: 1000,
				bothSides: true
			}
		});
	});

	it('tells a file showing one side from one showing both', () => {
		const both = (hidden?: number) => {
			const r = readReplay(replayFile({ hidden }));
			return r.ok && r.info.bothSides;
		};
		expect(both()).toBe(true);
		expect(both(0)).toBe(false);
		expect(both(1)).toBe(false);
	});

	it('rejects what is not a RiftAtlas replay', () => {
		for (const text of ['', 'not json', '[]', 'null', '{"format":"other","nodes":[]}'])
			expect(error(text)).toMatch(/isn't a RiftAtlas replay/);
	});

	it('rejects a version it does not know', () => {
		expect(error(replayFile({ version: 3 }))).toMatch(/version/);
	});

	it('rejects a game that is not between two players', () => {
		expect(error(replayFile({ legends: ['Azir, Emperor of the Sands'] }))).toMatch(/two players/);
	});

	it('rejects damaged files', () => {
		expect(error(replayFile({ frames: 0 }))).toMatch(/damaged/);
		expect(error(replayFile({ game: 0 }))).toMatch(/damaged/);
		expect(error(replayFile({ replayId: '' }))).toMatch(/damaged/);
		const file = JSON.parse(replayFile());
		expect(error(JSON.stringify({ ...file, root: { r: 9999 } }))).toMatch(/damaged/);
		expect(error(JSON.stringify({ ...file, nodes: file.nodes.slice(3) }))).toMatch(/damaged/);
	});

	it('rejects a file referencing one large node many times, quickly', () => {
		const n = 20_000;
		const hostile = (players: number) =>
			JSON.stringify({
				format: 'riftatlas-replay',
				version: 2,
				root: { r: 5 },
				nodes: [
					['o', Array.from({ length: n }, (_, i) => [`k${i}`, i])],
					['a', Array.from({ length: n }, () => ({ r: 0 }))],
					[
						'o',
						[
							['gameNumber', 1],
							['players', { r: players }]
						]
					],
					['a', [{ r: 4 }]],
					['o', [['state', { r: 2 }]]],
					[
						'o',
						[
							['replayId', 'R:1'],
							['completedAt', 1],
							['frames', { r: 3 }]
						]
					],
					['a', [{ r: 7 }, { r: 7 }]],
					['o', [['board', { r: 8 }]]],
					['o', [['legend', { r: 1 }]]]
				]
			});
		const start = performance.now();
		expect(error(hostile(1))).toMatch(/two players/);
		expect(error(hostile(6))).toMatch(/damaged/);
		expect(performance.now() - start).toBeLessThan(2000);
	});
});

describe('checkReplay', () => {
	const now = new Date(10_000_000);
	const since = new Date(1_000_000);
	const info: ReplayInfo = {
		replayId: 'R:1',
		game: 1,
		legends: ['Azir', 'Evelynn'],
		completedAt: 5_000_000,
		bothSides: true
	};
	const match = { p1Games: 2, p2Games: 0, games: null, p1Legend: 'Evelynn', p2Legend: 'Azir' };
	const check = (i: Partial<ReplayInfo> = {}, m: Partial<Reported> = {}) =>
		checkReplay({ ...info, ...i }, { ...match, ...m }, now, since);

	it('accepts a game of the match, whichever side each legend is on', () => {
		expect(check()).toBeNull();
		expect(check({ game: 2 })).toBeNull();
	});

	it('needs a reported result', () => {
		expect(check({}, { p1Games: null, p2Games: null })).toMatch(/Report the result/);
	});

	it('rejects a game the match did not have', () => {
		expect(check({ game: 3 })).toMatch(/game 3, but the match was reported with 2 games/);
		// A draw is a game too: only the per-game string knows.
		expect(check({ game: 3 }, { games: '1D1' })).toBeNull();
	});

	it('rejects other legends', () => {
		expect(check({ legends: ['Azir', 'Vex'] })).toBe(
			'This replay is Azir vs Vex, but the match was reported as Evelynn vs Azir.'
		);
		expect(check({ legends: ['Azir', 'Azir'] })).toMatch(/reported as/);
	});

	it("lets through legends it can't read: another language, or a name the league lacks", () => {
		expect(check({ legends: ['아지르', '이블린'] })).toBeNull();
		expect(check({ legends: ['Azir', 'Someone New'] })).toBeNull();
	});

	it('matches legends across spelling and the Master Yi variants', () => {
		const m = { p1Legend: "Kai'Sa", p2Legend: 'Master Yi (PG)' };
		expect(check({ legends: ['Master Yi', 'Kai’Sa'] }, m)).toBeNull();
	});

	it('skips the legend check when the result has none', () => {
		expect(check({ legends: ['Vex', 'Vi'] }, { p1Legend: null, p2Legend: null })).toBeNull();
	});

	it('rejects games from the future or from before the season', () => {
		expect(check({ completedAt: now.getTime() + 60_000 })).toBeNull();
		expect(check({ completedAt: now.getTime() + 10 * 60_000 })).toMatch(/future/);
		expect(check({ completedAt: since.getTime() - 1 })).toMatch(/older than the season/);
	});
});
