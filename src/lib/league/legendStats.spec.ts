import { describe, expect, it } from 'vitest';
import {
	gameWinPct,
	legendMatches,
	legendPlayers,
	legendStats,
	matchWinPct,
	playerLegends,
	type LegendMatch
} from './legendStats';

const m = (
	p1: string,
	l1: string,
	g1: number,
	g2: number,
	l2: string,
	p2: string
): LegendMatch => ({
	p1Id: p1,
	p2Id: p2,
	p1Games: g1,
	p2Games: g2,
	p1Legend: l1,
	p2Legend: l2
});
const ms = [
	m('a', 'Jinx', 2, 0, 'Ahri', 'b'),
	m('a', 'Jinx', 1, 1, 'Ahri', 'c'),
	m('b', 'Jinx', 2, 1, 'Jinx', 'c'), // mirror
	m('c', 'Ahri', 2, 1, 'Jinx', 'd')
];
const pick = ({ key, picks, mirrors, wins, draws, losses, gameWins, gameLosses }: any) => ({
	key,
	picks,
	mirrors,
	wins,
	draws,
	losses,
	gameWins,
	gameLosses
});

describe('legendStats', () => {
	it('tallies picks per legend; mirrors count as picks only', () => {
		const rows = legendStats(ms);
		expect(rows.map(pick)).toEqual([
			{
				key: 'Jinx',
				picks: 5,
				mirrors: 2,
				wins: 1,
				draws: 1,
				losses: 1,
				gameWins: 4,
				gameLosses: 3
			},
			{
				key: 'Ahri',
				picks: 3,
				mirrors: 0,
				wins: 1,
				draws: 1,
				losses: 1,
				gameWins: 3,
				gameLosses: 4
			}
		]);
		expect(rows.map((r) => r.players.size)).toEqual([4, 2]);
	});

	it('hides win % under 5 non-mirror matches unless asked', () => {
		const [jinx] = legendStats(ms);
		expect(matchWinPct(jinx)).toBeNull();
		expect(gameWinPct(jinx)).toBeNull();
		expect(matchWinPct(jinx, 0)).toBeCloseTo(1 / 3);
		expect(gameWinPct(jinx, 0)).toBeCloseTo(4 / 7);
	});

	it('lists the players of one legend', () => {
		expect(legendPlayers(ms, 'Jinx').map(pick)).toEqual([
			{ key: 'a', picks: 2, mirrors: 0, wins: 1, draws: 1, losses: 0, gameWins: 3, gameLosses: 1 },
			{ key: 'b', picks: 1, mirrors: 1, wins: 0, draws: 0, losses: 0, gameWins: 0, gameLosses: 0 },
			{ key: 'c', picks: 1, mirrors: 1, wins: 0, draws: 0, losses: 0, gameWins: 0, gameLosses: 0 },
			{ key: 'd', picks: 1, mirrors: 0, wins: 0, draws: 0, losses: 1, gameWins: 1, gameLosses: 2 }
		]);
	});

	it("splits a player's record by own and opponent legend, mirrors included", () => {
		const { playedAs, against } = playerLegends(ms, 'c');
		expect(playedAs.map((r) => [r.key, r.picks, r.wins, r.draws, r.losses])).toEqual([
			['Ahri', 2, 1, 1, 0],
			['Jinx', 1, 0, 0, 1] // mirror lost to b counts for the player
		]);
		expect(against.map((r) => [r.key, r.picks, r.wins, r.draws, r.losses])).toEqual([
			['Jinx', 3, 1, 1, 1]
		]);
	});

	it('leaves out unplayed and void matches', () => {
		const raw = [
			{ ...ms[0] },
			{ ...ms[1], p1Games: null, p2Games: null, p1Legend: null, p2Legend: null },
			{ ...ms[3] }
		];
		expect(legendMatches(raw, new Set(['d']))).toEqual([ms[0]]);
	});
});
