import { beforeEach, describe, expect, it } from 'vitest';
import type { History, HistoryMatch, HistorySeason } from '#lib/league/achievements.ts';
import { mastery, MASTERY_NEEDS, MASTERY_RANKS, portrait } from '#lib/league/mastery.ts';
import { compareRank, isRank, RANKS } from '#lib/league/ranks.ts';
import { LEGENDS } from '#lib/legends.ts';

const D = (day: number) => new Date(Date.UTC(2026, 0, day));
let day = 0;
beforeEach(() => (day = 0));
const S = (o: Partial<HistorySeason> = {}): HistorySeason => ({
	id: 1,
	publishedRound: 99,
	dropped: new Set(),
	finalizedAt: null,
	cutAt: null,
	championAt: null,
	finalAt: null,
	group: null,
	...o
});
// Me as p1, a 2–0 win as Ahri, reported the next day.
const M = (o: Partial<HistoryMatch> = {}): HistoryMatch => ({
	seasonId: 1,
	stage: 'group',
	round: 1,
	p1Id: 'me',
	p2Id: 'op',
	p1Games: 2,
	p2Games: 0,
	games: null,
	p1Legend: 'Ahri',
	p2Legend: 'Annie',
	diceWinnerId: 'me',
	reportedAt: D(++day),
	walkoverId: null,
	...o
});
const H = (matches: HistoryMatch[], seasons = [S()]): History => ({
	playerId: 'me',
	matches,
	seasons
});
const n = (k: number, o: Partial<HistoryMatch> = {}) => Array.from({ length: k }, () => M(o));
const of = (h: History, legend: string) => mastery(h).find((m) => m.legend === legend)!;

describe('ranks', () => {
	it('run wood to challenger, and mastery starts at bronze', () => {
		expect(RANKS[0]).toBe('wood');
		expect(RANKS.at(-1)).toBe('challenger');
		expect(MASTERY_RANKS[0]).toBe('bronze');
		expect(MASTERY_RANKS).toHaveLength(MASTERY_NEEDS.length);
		expect([...MASTERY_NEEDS]).toEqual([...MASTERY_NEEDS].sort((a, b) => a - b));
		expect(compareRank('challenger', 'wood')).toBeGreaterThan(0);
		expect(isRank('emerald')).toBe(true);
		expect(isRank('iron')).toBe(false);
	});
});

describe('mastery', () => {
	it('lists every legend, unranked until the first threshold', () => {
		const all = mastery(H(n(2)));
		expect(all.map((m) => m.legend)).toEqual([...LEGENDS]);
		expect(of(H(n(2)), 'Ahri')).toEqual({
			legend: 'Ahri',
			matches: 2,
			rank: null,
			hit: null,
			next: { rank: 'bronze', need: 3 }
		});
		expect(of(H(n(2)), 'Annie')).toMatchObject({ matches: 0, rank: null });
	});

	it('ranks up on the match that reaches the threshold, from either side', () => {
		const h = H(
			[...n(2), M({ p1Id: 'op', p2Id: 'me', p1Legend: 'Annie', p2Legend: 'Ahri', seasonId: 2 })],
			[S(), S({ id: 2 })]
		);
		expect(of(h, 'Ahri')).toMatchObject({
			matches: 3,
			rank: 'bronze',
			hit: { at: D(3), seasonId: 2 },
			next: { rank: 'silver', need: 7 }
		});
	});

	it('counts matches, not wins, and keeps the date of the latest rank', () => {
		const h = H([...n(6, { p1Games: 0, p2Games: 2 }), M({ p1Games: 1, p2Games: 1 }), M()]);
		expect(of(h, 'Ahri')).toMatchObject({ matches: 8, rank: 'silver', hit: { at: D(7) } });
	});

	it('keeps counting past the top rank', () => {
		const top = of(H(n(112)), 'Ahri');
		expect(top).toMatchObject({ matches: 112, rank: 'challenger', next: null });
		expect(top.hit).toEqual({ at: D(100), seasonId: 1 });
	});

	it('draws a legend with its champion portrait', () => {
		expect(portrait('Master Yi (XP)')).toBe('/achievements/champions/master-yi.png');
		expect(portrait("K'Sante")).toBe('/achievements/champions/ksante.png');
	});

	it('leaves out what achievements leave out', () => {
		const h = H([
			M({ walkoverId: 'me' }),
			M({ p1Games: null, p2Games: null, reportedAt: null }),
			M({ round: 5 }),
			M({ p1Legend: null })
		]);
		h.seasons[0].publishedRound = 1;
		expect(of(h, 'Ahri').matches).toBe(0);
	});
});
