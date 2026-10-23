import { describe, expect, it } from 'vitest';
import { nextPublish, published } from './publish';

describe('nextPublish', () => {
	it('starts with week 1', () => {
		expect(nextPublish(0, 2, 7)).toEqual({ week: 1, rounds: [1, 2] });
	});
	it('moves on a week at a time', () => {
		expect(nextPublish(2, 2, 7)).toEqual({ week: 2, rounds: [3, 4] });
	});
	it('stops at the last round', () => {
		expect(nextPublish(6, 2, 7)).toEqual({ week: 4, rounds: [7, 7] });
		expect(nextPublish(7, 2, 7)).toBeNull();
	});
	it('finishes a half-published week', () => {
		expect(nextPublish(3, 2, 7)).toEqual({ week: 2, rounds: [4, 4] });
	});
	it('has nothing to publish without matches', () => {
		expect(nextPublish(0, 2, 0)).toBeNull();
	});
});

describe('published', () => {
	it('keeps rounds up to the published one', () => {
		const ms = [{ round: 1 }, { round: 2 }, { round: 3 }];
		expect(published(ms, 2)).toEqual([{ round: 1 }, { round: 2 }]);
		expect(published(ms, 0)).toEqual([]);
	});
});
