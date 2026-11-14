import { gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from '../../routes/seasons/[slug]/matches/[id]/+page.server.ts';
import { auditLines } from '#lib/server/auditLog.ts';
import { currentRole } from '#lib/server/auth.ts';
import { getMatch, organizerEdit, type Match } from '#lib/server/matches.ts';
import { erasePlayer } from '#lib/server/players.ts';
import {
	canSeeReplays,
	deleteReplay,
	matchReplays,
	replayFileName,
	replayGzip as stored,
	replaySlots,
	replaysPublic,
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

const publishBoth = () => {
	setPublish(match(), 'p1', true);
	setPublish(match(), 'p2', true);
	expect(published(match())).toEqual([true, true]);
};
// Who has a file in which game.
const files = () =>
	matchReplays(matchId)
		.map((r) => `${r.game}:${r.uploadedBy}`)
		.sort();
const text = (game: number, by: string) => gunzipSync(stored(matchId, game, by)!).toString();

describe('saveReplay', () => {
	it('stores the file in the slot of its game and gives it back unchanged', () => {
		const file = replayFile({ game: 2 });
		expect(saveReplay(match(), SINCE, 'p2', file)).toEqual({
			game: 2,
			saved: true,
			replaced: false
		});
		expect(matchReplays(matchId)).toMatchObject([{ game: 2, uploadedBy: 'p2', bothSides: true }]);
		expect(text(2, 'p2')).toBe(file);
		expect(stored(matchId, 2, 'p1')).toBeUndefined();
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 3, hidden: 1 }));
		expect(matchReplays(matchId)[1]).toMatchObject({ game: 3, bothSides: false });
	});

	it('refuses a file that fails the checks, with the reason', () => {
		expect(saveReplay(match(), SINCE, 'p1', 'nope')).toMatch(/isn't a RiftAtlas replay/);
		expect(saveReplay(match(), SINCE, 'p1', replayFile({ game: 4 }))).toMatch(/game 4/);
		expect(saveReplay(match(), new Date(), 'p1', replayFile())).toMatch(/older than the season/);
		const big = JSON.stringify({ pad: 'x'.repeat(5 * 1024 * 1024) });
		expect(saveReplay(match(), SINCE, 'p1', big)).toMatch(/5 MB/);
		expect(matchReplays(matchId)).toEqual([]);
	});

	it("stores the second player's file of a game next to the first, and Publish stands", () => {
		// Both players' downloads of a game share its `replayId`.
		const mine = replayFile({ completedAt: 1, hidden: 1 });
		saveReplay(match(), SINCE, 'p1', mine);
		publishBoth();
		expect(saveReplay(match(), SINCE, 'p2', replayFile({ completedAt: 2 }))).toEqual({
			game: 1,
			saved: true,
			replaced: false
		});
		expect(files()).toEqual(['1:p1', '1:p2']);
		expect(published(match())).toEqual([true, true]);
		// Replacing one keeps the other player's.
		const again = replayFile({ completedAt: 3 });
		expect(saveReplay(match(), SINCE, 'p2', again)).toMatchObject({ replaced: true });
		expect([text(1, 'p1'), text(1, 'p2')]).toEqual([mine, again]);
		expect(published(match())).toEqual([true, true]);
		// Even a byte-identical file is the other player's own.
		saveReplay(match(), SINCE, 'p2', replayFile({ game: 2, completedAt: 4 }));
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 2, completedAt: 4 }));
		expect(files()).toEqual(['1:p1', '1:p2', '2:p1', '2:p2']);
	});

	it('the same file again from its uploader changes nothing', () => {
		const file = replayFile();
		saveReplay(match(), SINCE, 'p1', file);
		expect(saveReplay(match(), SINCE, 'p1', file)).toEqual({
			game: 1,
			saved: true,
			replaced: true
		});
		expect(files()).toEqual(['1:p1']);
		expect(
			auditLines(seasonId, { organizer: true }).filter((l) => /uploaded/.test(l.what))
		).toHaveLength(1);
	});

	it('a file goes where its RiftAtlas game already is, whatever number it says', () => {
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 1, replayId: 'R' }));
		expect(saveReplay(match(), SINCE, 'p2', replayFile({ game: 2, replayId: 'R' }))).toMatchObject({
			game: 1,
			saved: true
		});
		expect(files()).toEqual(['1:p1', '1:p2']);
	});

	it("asks which game when the file's own game holds another game's file", () => {
		// The series moved to a second room: its first game also says "game 1".
		saveReplay(match(), SINCE, 'p1', replayFile({ replayId: 'room1:1' }));
		const second = replayFile({ replayId: 'room2:1' });
		// Nothing is stored until the player says which game it is.
		expect(saveReplay(match(), SINCE, 'p1', second)).toEqual({
			game: 1,
			saved: false,
			held: 'own'
		});
		expect(saveReplay(match(), SINCE, 'p2', second)).toEqual({
			game: 1,
			saved: false,
			held: 'theirs'
		});
		expect(files()).toEqual(['1:p1']);
	});

	it("never replaces the uploader's file of another RiftAtlas game unasked", () => {
		const mineB = replayFile({ replayId: 'B' });
		saveReplay(match(), SINCE, 'p1', mineB);
		// The opponent's view of game A: asked which game, they choose game 1.
		const theirsA = replayFile({ replayId: 'A' });
		expect(saveReplay(match(), SINCE, 'p2', theirsA)).toMatchObject({ held: 'theirs' });
		expect(saveReplay(match(), SINCE, 'p2', theirsA, 1)).toMatchObject({ game: 1, saved: true });
		const mineA = replayFile({ replayId: 'A', completedAt: 5 });
		expect(saveReplay(match(), SINCE, 'p1', mineA)).toEqual({ game: 1, saved: false, held: 'own' });
		expect(files()).toEqual(['1:p1', '1:p2']);
		expect(text(1, 'p1')).toBe(mineB);
		// Choosing the game does replace it.
		expect(saveReplay(match(), SINCE, 'p1', mineA, 1)).toEqual({
			game: 1,
			saved: true,
			replaced: true
		});
		expect(text(1, 'p1')).toBe(mineA);
	});

	it('a chosen game wins, and replaces only the uploader’s own file', () => {
		saveReplay(match(), SINCE, 'p1', replayFile({ replayId: 'room1:1' }));
		publishBoth();
		const second = replayFile({ replayId: 'room2:1' });
		// Next to the opponent's file of another game: the site can't tell which one is misplaced.
		expect(saveReplay(match(), SINCE, 'p2', second, 1)).toMatchObject({ game: 1, saved: true });
		expect(files()).toEqual(['1:p1', '1:p2']);
		expect(saveReplay(match(), SINCE, 'p1', second, 2)).toMatchObject({ game: 2, saved: true });
		expect(files()).toEqual(['1:p1', '1:p2', '2:p1']);
		// Chosen wrongly: choosing again moves it, and a chosen game does replace.
		expect(saveReplay(match(), SINCE, 'p1', second, 3)).toMatchObject({ game: 3 });
		expect(files()).toEqual(['1:p1', '1:p2', '3:p1']);
		expect(saveReplay(match(), SINCE, 'p1', second, 1)).toMatchObject({ replaced: true });
		expect(files()).toEqual(['1:p1', '1:p2']);
		expect(saveReplay(match(), SINCE, 'p1', second, 4)).toMatch(/game 4/);
		expect(published(match())).toEqual([true, true]);
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
		expect(saveReplay(match(other), SINCE, 'p3', replayFile(), 2)).toMatch(/another match/);
		expect(matchReplays(other)).toEqual([]);
	});
});

describe('deleteReplay', () => {
	it("removes one player's file; the Publish flags go only with the last file", () => {
		saveReplay(match(), SINCE, 'p1', replayFile());
		saveReplay(match(), SINCE, 'p2', replayFile());
		publishBoth();
		expect(deleteReplay(match(), 'p1', 1, 'p1')).toBe(true);
		expect(files()).toEqual(['1:p2']);
		expect(published(match())).toEqual([true, true]);
		expect(deleteReplay(match(), 'p1', 1, 'p1')).toBe(false);
		expect(deleteReplay(match(), 'p4', 1, 'p2')).toBe(true);
		expect(matchReplays(matchId)).toEqual([]);
		expect(published(match())).toEqual([false, false]);
	});
});

describe('replaySlots', () => {
	it("lists every played game with its files, player 1's first", () => {
		saveReplay(match(), SINCE, 'p2', replayFile({ game: 2 }));
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 2, hidden: 1 }));
		const when = new Date().toLocaleDateString('en-GB', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: 'Europe/Helsinki'
		});
		// A name with nothing to put in a file name: the side stands in.
		const names: Record<string, string> = { p1: 'Ann Lee', p2: '아지르' };
		const file = (side: string) => `poroleague-s1-match-${matchId}-game-2-${side}.json`;
		expect(replaySlots(match(), 's1', (id) => names[id])).toEqual([
			{ game: 1, split: false, files: [] },
			{
				game: 2,
				split: false,
				files: [
					{ side: 1, by: 'Ann Lee', bothSides: false, when, file: file('ann-lee') },
					{ side: 2, by: '아지르', bothSides: true, when, file: file('player-2') }
				]
			},
			{ game: 3, split: false, files: [] }
		]);
	});

	it('marks a game split only when its two one-side files are the same game', () => {
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 1, hidden: 1 }));
		saveReplay(match(), SINCE, 'p2', replayFile({ game: 1, hidden: 0 }));
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 2, hidden: 1 }));
		saveReplay(match(), SINCE, 'p2', replayFile({ game: 2, hidden: 0, replayId: 'X:2' }), 2);
		saveReplay(match(), SINCE, 'p1', replayFile({ game: 3, hidden: 1 }));
		const split = replaySlots(match(), 's1', String).map((s) => [s.files.length, s.split]);
		expect(split).toEqual([
			[2, true],
			[2, false],
			[1, false]
		]);
	});

	it("names the two files of a game apart even when the players' names do not", () => {
		const names = (p1: string, p2: string) =>
			([1, 2] as const).map((side) => replayFileName('s1', 7, 1, side, [p1, p2]));
		const file = (who: string) => `poroleague-s1-match-7-game-1-${who}.json`;
		expect(names('Ann Lee', 'Bo')).toEqual([file('ann-lee'), file('bo')]);
		expect(names('Ann Lee', '아지르')).toEqual([file('ann-lee'), file('player-2')]);
		for (const [p1, p2] of [
			['Ann', 'Ann'],
			['Ann Lee', 'ann_lee!'],
			['아지르', '이블린']
		])
			expect(names(p1, p2)).toEqual([file('player-1'), file('player-2')]);
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
		expect([replaysPublic(match()), replaysPublic(match(), true)]).toEqual([true, false]);
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
		for (const [k, v] of Object.entries(form))
			body.set(k, k === 'file' ? new File([v], 'replay.json') : v);
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
	type Data = { match: object; replays: { published: boolean[] | null } | null };
	const loaded = async (...who: [string | null, boolean?]) => (await load(event(...who))) as Data;
	const message = async (action: keyof typeof actions, ...args: Parameters<typeof event>) =>
		((await actions[action](event(...args))) as { message: string }).message;

	beforeEach(() => {
		vi.mocked(currentRole).mockResolvedValue(true);
		saveReplay(match(), SINCE, 'p1', replayFile());
		setPublish(match(), 'p2', true);
	});

	it('tells who pressed Publish to the players and a re-checked organizer only', async () => {
		expect((await loaded('p1')).replays?.published).toEqual([false, true]);
		expect((await loaded('p2')).replays?.published).toEqual([true, false]);
		expect((await loaded('p4', true)).replays?.published).toEqual([false, true]);
		// Private: nobody else gets the panel at all.
		expect((await loaded('p3')).replays).toBeNull();
		expect((await loaded(null)).replays).toBeNull();
		// The session says organizer, Discord no longer does.
		vi.mocked(currentRole).mockResolvedValue(false);
		expect((await loaded('p4', true)).replays).toBeNull();

		// Public: they watch, without the flags.
		setPublish(match(), 'p1', true);
		for (const who of [['p3'], [null], ['p4', true]] as [string | null, boolean?][]) {
			const data = await loaded(...who);
			expect(data.replays).toMatchObject({ public: true, published: null });
			expect(JSON.stringify(data.match)).not.toMatch(/PublishReplay/);
		}
		expect(JSON.stringify((await loaded('p1')).match)).not.toMatch(/PublishReplay/);
	});

	it('says where publishing stands after each press', async () => {
		expect(await message('publishReplays', 'p2', false, { on: '0' })).toBe('Replays are private.');
		expect(await message('publishReplays', 'p1', false, { on: '1' })).toBe(
			'You pressed Publish. The replays go public when Player 2 does too.'
		);
		expect(await message('publishReplays', 'p2', false, { on: '1' })).toBe('Replays are public.');
		expect(published(match())).toEqual([true, true]);
	});

	it('adds a replay, or asks which game when the slot has another one', async () => {
		const add = (who: string, form: Record<string, string>) =>
			actions.replay(event(who, false, form));
		// The action checks against the real season, made a moment ago.
		const completedAt = Date.now() + 1000;
		expect(await add('p1', { file: replayFile({ game: 2, replayId: 'g2', completedAt }) })).toEqual(
			{ message: 'Replay added for game 2. It stays private until you both publish.' }
		);
		const file = replayFile({ replayId: 'room2:1', completedAt });
		const asks = (message: string) => ({ status: 409, data: { message, upload: 'which' } });
		expect(await add('p1', { file })).toMatchObject(
			asks('You already have a replay for game 1. Choose which game this file is.')
		);
		expect(await add('p2', { file })).toMatchObject(
			asks("Game 1 has Player 1's replay of another game. Choose which game this file is.")
		);
		expect(await add('p1', { file, game: '3' })).toEqual({
			message: 'Replay added for game 3. It stays private until you both publish.'
		});
		expect(await add('p1', { file: 'nope' })).toMatchObject({
			status: 400,
			data: { upload: 'refused' }
		});
		setPublish(match(), 'p1', true);
		expect(
			await add('p1', {
				file: replayFile({ replayId: 'room2:1', completedAt: completedAt + 1 }),
				game: '3'
			})
		).toEqual({
			message: 'Replay replaced for game 3. It is public.'
		});
		expect(matchReplays(matchId).map((r) => r.game)).toEqual([1, 2, 3]);
	});

	it('a player deletes only their own file, an organizer any', async () => {
		saveReplay(match(), SINCE, 'p2', replayFile());
		const del = (who: string, organizer: boolean, side: string) =>
			actions.deleteReplay(event(who, organizer, { game: '1', side }));
		expect(await del('p2', false, '1')).toMatchObject({
			status: 403,
			data: { message: "This replay isn't yours to delete." }
		});
		expect(await del('p2', false, '2')).toEqual({ message: 'Game 1 replay deleted.' });
		expect(await del('p2', false, '2')).toMatchObject({ status: 404 });
		expect(await del('p4', true, '1')).toEqual({ message: 'Game 1 replay deleted.' });
		expect(matchReplays(matchId)).toEqual([]);
	});
});

it('every change is in the audit log', () => {
	saveReplay(match(), SINCE, 'p1', replayFile());
	setPublish(match(), 'p2', true);
	setPublish(match(), 'p2', false);
	deleteReplay(match(), 'p1', 1, 'p1');
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
