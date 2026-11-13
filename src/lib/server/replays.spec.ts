import { beforeEach, describe, expect, it } from 'vitest';
import { auditLines } from '#lib/server/auditLog.ts';
import { getMatch, type Match } from '#lib/server/matches.ts';
import { erasePlayer } from '#lib/server/players.ts';
import {
	canSeeReplays,
	deleteReplay,
	matchReplays,
	replayFile as stored,
	saveReplay,
	setPublish
} from '#lib/server/replays.ts';
import { replayFile } from '#lib/server/test/replayFile.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

const SINCE = new Date(0);
let seasonId: number;
let matchId: number;
const match = (id = matchId) => getMatch(seasonId, id)!;
const reported = (p1Id: string, p2Id: string) =>
	seedMatch({
		seasonId,
		round: 1,
		p1Id,
		p2Id,
		p1Games: 2,
		p2Games: 1,
		p1Legend: 'Azir',
		p2Legend: 'Evelynn',
		reportedBy: p1Id,
		reportedAt: new Date()
	}).id;
const published = (m: Match) => [m.p1PublishReplay, m.p2PublishReplay];

beforeEach(() => {
	seedPlayers(4);
	seasonId = seedSeason({ status: 'play', publishedRound: 1 }).id;
	seedEntries(seasonId, ['p1', 'p2', 'p3', 'p4']);
	matchId = reported('p1', 'p2');
});

describe('saveReplay', () => {
	it('stores the file in the slot of its game and gives it back unchanged', () => {
		const file = replayFile({ game: 2 });
		expect(saveReplay(match(), SINCE, 'p2', file)).toBeNull();
		expect(matchReplays(matchId)).toMatchObject([{ game: 2, uploadedBy: 'p2' }]);
		expect(stored(matchId, 2)!.toString()).toBe(file);
		expect(stored(matchId, 1)).toBeUndefined();
	});

	it('refuses a file that fails the checks, with the reason', () => {
		expect(saveReplay(match(), SINCE, 'p1', 'nope')).toMatch(/isn't a RiftAtlas replay/);
		expect(saveReplay(match(), SINCE, 'p1', replayFile({ game: 4 }))).toMatch(/game 4/);
		expect(saveReplay(match(), new Date(), 'p1', replayFile())).toMatch(/older than the season/);
		const big = JSON.stringify({ pad: 'x'.repeat(5 * 1024 * 1024) });
		expect(saveReplay(match(), SINCE, 'p1', big)).toMatch(/5 MB/);
		expect(matchReplays(matchId)).toEqual([]);
	});

	it('replaces the game it already has, and both players decide on publishing again', () => {
		saveReplay(match(), SINCE, 'p1', replayFile({ replayId: 'mine' }));
		setPublish(match(), 'p1', true);
		setPublish(match(), 'p2', true);
		expect(published(match())).toEqual([true, true]);
		expect(saveReplay(match(), SINCE, 'p2', replayFile({ replayId: 'theirs' }))).toBeNull();
		expect(matchReplays(matchId)).toMatchObject([{ game: 1, uploadedBy: 'p2' }]);
		expect(published(match())).toEqual([false, false]);
		// The same file again is a replace too, not a clash with itself.
		expect(saveReplay(match(), SINCE, 'p2', replayFile({ replayId: 'theirs' }))).toBeNull();
	});

	it('refuses a replay that is already on another match', () => {
		const other = reported('p3', 'p4');
		saveReplay(match(), SINCE, 'p1', replayFile());
		expect(saveReplay(match(other), SINCE, 'p3', replayFile())).toMatch(/another match/);
		expect(matchReplays(other)).toEqual([]);
	});
});

describe('deleteReplay', () => {
	it('removes the game and the consent to publish', () => {
		saveReplay(match(), SINCE, 'p1', replayFile());
		setPublish(match(), 'p2', true);
		expect(deleteReplay(match(), 'p2', 1)).toBe(true);
		expect(matchReplays(matchId)).toEqual([]);
		expect(published(match())).toEqual([false, false]);
		expect(deleteReplay(match(), 'p2', 1)).toBe(false);
	});
});

describe('who sees replays', () => {
	it('is the two players and organizers until both players publish', () => {
		const sees = () => [
			canSeeReplays(match(), 'p1'),
			canSeeReplays(match(), 'p3'),
			canSeeReplays(match(), null),
			canSeeReplays(match(), 'p3', true)
		];
		expect(sees()).toEqual([true, false, false, true]);
		setPublish(match(), 'p1', true);
		expect(sees()).toEqual([true, false, false, true]);
		setPublish(match(), 'p2', true);
		expect(sees()).toEqual([true, true, true, true]);
		setPublish(match(), 'p1', false);
		expect(sees()).toEqual([true, false, false, true]);
	});

	it('only a player of the match can publish', () => {
		expect(() => setPublish(match(), 'p3', true)).toThrow(/not in match/);
	});
});

it('every change is in the audit log', () => {
	saveReplay(match(), SINCE, 'p1', replayFile());
	setPublish(match(), 'p2', true);
	setPublish(match(), 'p2', false);
	deleteReplay(match(), 'p1', 1);
	expect(
		auditLines(seasonId)
			.reverse()
			.map((l) => `${l.label}: ${l.actor}: ${l.what}`)
	).toEqual([
		'Replay: Player 1: R1 · Player 1 vs Player 2 · Game 1 replay uploaded',
		'Replay: Player 2: R1 · Player 1 vs Player 2 · Agreed to publish the replays',
		'Replay: Player 2: R1 · Player 1 vs Player 2 · Took back publishing the replays',
		'Replay: Player 1: R1 · Player 1 vs Player 2 · Game 1 replay deleted'
	]);
});

it("erasing a player deletes their matches' replays, whoever uploaded them", () => {
	const other = reported('p3', 'p4');
	saveReplay(match(), SINCE, 'p2', replayFile());
	setPublish(match(), 'p2', true);
	saveReplay(match(other), SINCE, 'p3', replayFile({ replayId: 'other' }));
	erasePlayer('p1', 'p4');
	expect(matchReplays(matchId)).toEqual([]);
	expect(published(match())).toEqual([false, false]);
	expect(matchReplays(other)).toHaveLength(1);
});
