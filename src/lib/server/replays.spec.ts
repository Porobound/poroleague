import { gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions } from '../../routes/seasons/[slug]/matches/[id]/+page.server.ts';
import { auditLines } from '#lib/server/auditLog.ts';
import { currentRole } from '#lib/server/auth.ts';
import { getMatch, organizerEdit, type Match } from '#lib/server/matches.ts';
import { erasePlayer } from '#lib/server/players.ts';
import {
	canSeeReplays,
	deleteReplay,
	matchReplays,
	replayGzip as stored,
	replaySlots,
	saveReplay,
	setPublish
} from '#lib/server/replays.ts';
import { replayFile } from '#lib/server/test/replayFile.ts';
import { seedEntries, seedMatch, seedPlayers, seedSeason } from '#lib/server/test/seed.ts';

// The Discord re-check has its own tests (auth.spec.ts); here it says what each test needs.
vi.mock('#lib/server/auth.ts', async (original) => ({
	...(await original<typeof import('#lib/server/auth.ts')>()),
	currentRole: vi.fn()
}));

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
		expect(gunzipSync(stored(matchId, 2)!).toString()).toBe(file);
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

	const publishBoth = () => {
		setPublish(match(), 'p1', true);
		setPublish(match(), 'p2', true);
		expect(published(match())).toEqual([true, true]);
	};

	it('replaces a game with the other view of it, and both decide on publishing again', () => {
		saveReplay(match(), SINCE, 'p1', replayFile({ completedAt: 1 }));
		publishBoth();
		expect(saveReplay(match(), SINCE, 'p2', replayFile({ completedAt: 2 }))).toBeNull();
		expect(matchReplays(matchId)).toMatchObject([{ game: 1, uploadedBy: 'p2' }]);
		expect(published(match())).toEqual([false, false]);
	});

	it('the same file again changes nothing', () => {
		const file = replayFile();
		saveReplay(match(), SINCE, 'p1', file);
		publishBoth();
		expect(saveReplay(match(), SINCE, 'p2', file)).toBeNull();
		expect(matchReplays(matchId)).toMatchObject([{ game: 1, uploadedBy: 'p1' }]);
		expect(published(match())).toEqual([true, true]);
		expect(
			auditLines(seasonId, { organizer: true }).filter((l) => /uploaded/.test(l.what))
		).toHaveLength(1);
	});

	it('a file from another room never replaces a game on its own number', () => {
		// The series moved to a second room: its first game also says "game 1".
		saveReplay(match(), SINCE, 'p1', replayFile({ replayId: 'room1:1' }));
		const second = replayFile({ replayId: 'room2:1' });
		expect(saveReplay(match(), SINCE, 'p1', second)).toBe(
			'Game 1 already has another replay. Choose which game this file is, or choose game 1 to replace that one.'
		);
		expect(saveReplay(match(), SINCE, 'p1', second, 2)).toBeNull();
		expect(matchReplays(matchId).map((r) => r.game)).toEqual([1, 2]);
		// Chosen wrongly: choosing again moves it, and a chosen game does replace.
		expect(saveReplay(match(), SINCE, 'p1', second, 3)).toBeNull();
		expect(matchReplays(matchId).map((r) => r.game)).toEqual([1, 3]);
		expect(saveReplay(match(), SINCE, 'p1', second, 1)).toBeNull();
		expect(matchReplays(matchId).map((r) => r.game)).toEqual([1]);
		expect(saveReplay(match(), SINCE, 'p1', second, 4)).toMatch(/game 4/);
	});

	it('refuses a match with an erased player: erasure deleted its replays for good', () => {
		erasePlayer('p2', 'p4');
		expect(saveReplay(match(), SINCE, 'p1', replayFile())).toMatch(/was erased/);
		expect(matchReplays(matchId)).toEqual([]);
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

describe('replaySlots', () => {
	it('lists every played game, with or without a replay', () => {
		saveReplay(match(), SINCE, 'p2', replayFile({ game: 2 }));
		const when = new Date().toLocaleDateString('en-GB', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: 'Europe/Helsinki'
		});
		expect(replaySlots(match(), 's1', (id) => id.toUpperCase())).toEqual([
			{ game: 1, replay: null },
			{ game: 2, replay: { by: 'P2', when, file: `poroleague-s1-match-${matchId}-game-2.json` } },
			{ game: 3, replay: null }
		]);
	});

	it('counts the games from the per-game result when there is one', () => {
		const id = seedMatch({
			seasonId,
			round: 2,
			p1Id: 'p3',
			p2Id: 'p4',
			p1Games: 2,
			p2Games: 0,
			games: '11'
		}).id;
		expect(replaySlots(match(id), 's1', String).map((s) => s.game)).toEqual([1, 2]);
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
		saveReplay(match(), SINCE, 'p1', replayFile());
		expect(sees()).toEqual([true, false, false, true]);
		setPublish(match(), 'p1', true);
		expect(sees()).toEqual([true, false, false, true]);
		setPublish(match(), 'p2', true);
		expect(sees()).toEqual([true, true, true, true]);
		// An early match stays between its players until its week is published.
		expect(canSeeReplays(match(), 'p3', false, true)).toBe(false);
		expect(canSeeReplays(match(), 'p2', false, true)).toBe(true);
		setPublish(match(), 'p1', false);
		expect(sees()).toEqual([true, false, false, true]);
	});

	it('needs a replay to publish', () => {
		expect(setPublish(match(), 'p1', true)).toBe(false);
		expect(published(match())).toEqual([false, false]);
		expect(auditLines(seasonId, { organizer: true })).toEqual([]);
	});

	it('saying it twice is logged once', () => {
		saveReplay(match(), SINCE, 'p1', replayFile());
		expect(setPublish(match(), 'p1', true)).toBe(true);
		expect(setPublish(match(), 'p1', true)).toBe(true);
		expect(setPublish(match(), 'p2', false)).toBe(true);
		expect(
			auditLines(seasonId, { organizer: true }).filter((l) => /publish/.test(l.what))
		).toHaveLength(1);
	});

	it('only a player of the match can publish', () => {
		expect(() => setPublish(match(), 'p3', true)).toThrow(/not in match/);
	});
});

describe('the match page', () => {
	// A fake RequestEvent: just what the load and the actions read.
	const event = (id: string | null, isOrganizer = false, form: Record<string, string> = {}) => {
		const url = new URL('http://localhost/seasons/s1');
		const body = new FormData();
		for (const [k, v] of Object.entries(form)) body.set(k, v);
		return {
			params: { slug: 's1', id: String(matchId) },
			url,
			locals: {
				user: id && { id, displayName: id, avatar: null, isOrganizer },
				session: id && { id: 'sess', accessToken: 'tok' }
			},
			request: new Request(url, { method: 'POST', body })
		} as never;
	};
	const message = async (
		action: 'publishReplays' | 'deleteReplay',
		...args: Parameters<typeof event>
	) => ((await actions[action](event(...args))) as { message: string }).message;

	beforeEach(() => {
		vi.mocked(currentRole).mockResolvedValue(true);
		saveReplay(match(), SINCE, 'p1', replayFile());
		setPublish(match(), 'p2', true);
	});

	it('says where publishing stands after each press', async () => {
		expect(await message('publishReplays', 'p2', false, { on: '0' })).toBe('Replays are private.');
		expect(await message('publishReplays', 'p1', false, { on: '1' })).toBe(
			'You pressed Publish. The replays go public when Player 2 does too.'
		);
		expect(await message('publishReplays', 'p2', false, { on: '1' })).toBe('Replays are public.');
		expect(published(match())).toEqual([true, true]);
	});

	it('says when deleting a replay took a Publish back', async () => {
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 2, replayId: 'g2' }));
		setPublish(match(), 'p2', true);
		expect(await message('deleteReplay', 'p1', false, { game: '1' })).toBe(
			'Game 1 replay deleted. Replays are private again.'
		);
		expect(await message('deleteReplay', 'p4', true, { game: '2' })).toBe('Game 2 replay deleted.');
	});
});

it('every change is in the audit log', () => {
	saveReplay(match(), SINCE, 'p1', replayFile());
	setPublish(match(), 'p2', true);
	setPublish(match(), 'p2', false);
	deleteReplay(match(), 'p1', 1);
	// Organizers only: the public log would tell who has a private replay and who won't publish.
	expect(auditLines(seasonId)).toEqual([]);
	expect(
		auditLines(seasonId, { organizer: true })
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

describe('an organizer edit', () => {
	const result = {
		games: null,
		p1Games: 2,
		p2Games: 1,
		p1Legend: 'Azir',
		p2Legend: 'Evelynn',
		diceWinnerId: 'p1'
	};
	beforeEach(() => {
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 3 }));
		setPublish(match(), 'p1', true);
	});

	it('keeps the replays when legends and games stand', () => {
		organizerEdit(match(), 'p4', { ...result, p1Games: 1, p2Games: 2, diceWinnerId: 'p2' });
		expect(matchReplays(matchId)).toHaveLength(1);
		expect(published(match())).toEqual([true, false]);
	});

	it('drops them when a legend changes or a game goes', () => {
		organizerEdit(match(), 'p4', { ...result, p2Legend: 'Vex' });
		expect(matchReplays(matchId)).toEqual([]);
		expect(published(match())).toEqual([false, false]);
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 3, legends: ['Azir, A', 'Vex, B'] }));
		organizerEdit(match(), 'p4', { ...result, p2Legend: 'Vex', p2Games: 0 });
		expect(matchReplays(matchId)).toEqual([]);
	});
});
