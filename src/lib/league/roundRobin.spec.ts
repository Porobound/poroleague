import { describe, expect, it } from 'vitest';
import { roundRobin } from './roundRobin';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function assertComplete(n: number) {
	const rounds = roundRobin(ids(n));
	const seen = new Set<string>();
	for (const round of rounds) {
		const inRound = round.flat();
		expect(new Set(inRound).size).toBe(inRound.length); // nobody twice in a round
		for (const pair of round) {
			const key = [...pair].sort().join('-');
			expect(seen.has(key)).toBe(false); // no repeat pairing
			seen.add(key);
		}
	}
	expect(seen.size).toBe((n * (n - 1)) / 2); // everyone meets everyone
	return rounds;
}

describe('roundRobin', () => {
	it('even count: n-1 rounds of n/2 matches', () => {
		const rounds = assertComplete(12);
		expect(rounds).toHaveLength(11);
		expect(rounds.every((r) => r.length === 6)).toBe(true);
	});

	it('odd count: n rounds, one bye per round', () => {
		const rounds = assertComplete(13);
		expect(rounds).toHaveLength(13);
		expect(rounds.every((r) => r.length === 6)).toBe(true);
	});

	it('fewer than two players: no rounds', () => {
		expect(roundRobin([])).toEqual([]);
		expect(roundRobin(['p0'])).toEqual([]);
	});
});
