import { gzipSync } from 'node:zlib';
import { and, asc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { day } from '#lib/format.ts';
import { leagueDate } from '#lib/league/time.ts';
import { checkReplay, MAX_REPLAY_BYTES, readReplay, TOO_BIG } from '#lib/replay.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, matches, players, replays } from '#lib/server/db/schema.ts';
import type { Match, Tx } from '#lib/server/matches.ts';

export const inMatch = (m: Match, playerId: string) => playerId === m.p1Id || playerId === m.p2Id;

// A replay shows its uploader's deck and hand: the two players and organizers see it, everyone
// else only once both players have published. `hidden`: an early match nobody else knows was played.
export const canSeeReplays = (
	m: Match,
	viewerId: string | null,
	organizer = false,
	hidden = false
) =>
	(!hidden && m.p1PublishReplay && m.p2PublishReplay) ||
	organizer ||
	(!!viewerId && inMatch(m, viewerId));

// The match's replay files, without their contents.
export const matchReplays = (matchId: number) =>
	db
		.select({
			game: replays.game,
			uploadedBy: replays.uploadedBy,
			bothSides: replays.bothSides,
			createdAt: replays.createdAt
		})
		.from(replays)
		.where(eq(replays.matchId, matchId))
		.orderBy(asc(replays.game))
		.all();

// `side`: the uploader is the match's player 1 or 2; it names the file when their name can't.
export const replayFileName = (
	slug: string,
	matchId: number,
	game: number,
	side: 1 | 2,
	uploader: string
) =>
	`poroleague-${slug}-match-${matchId}-game-${game}-${
		uploader
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || `player-${side}`
	}.json`;

// The match's player 1 or 2.
export const sideOf = (m: Match, side: 1 | 2) => (side === 1 ? m.p1Id : m.p2Id);

// One entry per played game, for the match page, with its files in the match's player order.
export function replaySlots(m: Match, slug: string, name: (playerId: string) => string) {
	const held = matchReplays(m.id);
	const played = m.games?.length ?? (m.p1Games ?? 0) + (m.p2Games ?? 0);
	return Array.from({ length: played }, (_, i) => ({
		game: i + 1,
		files: ([1, 2] as const).flatMap((side) => {
			const r = held.find((r) => r.game === i + 1 && r.uploadedBy === sideOf(m, side));
			if (!r) return [];
			const by = name(r.uploadedBy);
			return [
				{
					side,
					by,
					bothSides: r.bothSides,
					when: day(leagueDate(r.createdAt)),
					file: replayFileName(slug, m.id, i + 1, side, by)
				}
			];
		})
	}));
}

const slot = (matchId: number, game: number) =>
	and(eq(replays.matchId, matchId), eq(replays.game, game));

// The JSON file as RiftAtlas wrote it, still gzipped: downloads go out that way.
export const replayGzip = (matchId: number, game: number, uploaderId: string) =>
	db
		.select({ data: replays.data })
		.from(replays)
		.where(and(slot(matchId, game), eq(replays.uploadedBy, uploaderId)))
		.get()?.data;

// What the players agreed to publish is gone or changed: both decide again.
const unpublish = (tx: Tx, matchIds: number[]) =>
	tx
		.update(matches)
		.set({ p1PublishReplay: false, p2PublishReplay: false })
		.where(inArray(matches.id, matchIds))
		.run();

// For matches whose result was cleared or whose player was erased.
export function dropReplays(tx: Tx, matchIds: number[]) {
	tx.delete(replays).where(inArray(replays.matchId, matchIds)).run();
	unpublish(tx, matchIds);
}

const log = (tx: Tx, m: Match, actorId: string, after: object) =>
	tx
		.insert(audit)
		.values({ seasonId: m.seasonId, matchId: m.id, actorId, action: 'replay', after })
		.run();

export type Saved =
	| { game: number; saved: true; replaced: boolean }
	| { game: number; saved: false; held: 'own' | 'theirs' };

// Stores the uploader's file in a game of the match. Returns why not, or the game: saved
// (`replaced`: the uploader's own file of that game), or not (nothing stored) because that game
// holds another game's file, the uploader's own or the opponent's, so the player has to say which
// game the file is. `asGame`: the game the player chose. `since`: nothing older can be a game of
// this season.
export function saveReplay(
	m: Match,
	since: Date,
	actorId: string,
	text: string,
	asGame?: number
): string | Saved {
	if (Buffer.byteLength(text) > MAX_REPLAY_BYTES) return TOO_BIG;
	const read = readReplay(text);
	if (!read.ok) return read.error;
	const { replayId, bothSides } = read.info;
	const data = gzipSync(text);
	return db.transaction((tx) => {
		// Erasure deleted this match's replays; a new one would bring the erased player's name back.
		const erased = tx
			.select({ id: players.id })
			.from(players)
			.where(and(inArray(players.id, [m.p1Id, m.p2Id]), isNotNull(players.erasedAt)))
			.get();
		if (erased) return 'A player of this match was erased, so it keeps no replays.';
		const known = tx
			.select({ matchId: replays.matchId, game: replays.game, uploadedBy: replays.uploadedBy })
			.from(replays)
			.where(eq(replays.replayId, replayId))
			.all();
		if (known.some((r) => r.matchId !== m.id)) return 'This replay is already on another match.';
		// A chosen game; else the game already holding a file of this RiftAtlas game (the other
		// player's view of it); else the game the file says it is.
		const game =
			asGame ?? (known.find((r) => r.uploadedBy === actorId) ?? known[0])?.game ?? read.info.game;
		const error = checkReplay({ ...read.info, game }, m, new Date(), since);
		if (error) return error;
		const here = tx
			.select({ uploadedBy: replays.uploadedBy, replayId: replays.replayId, data: replays.data })
			.from(replays)
			.where(slot(m.id, game))
			.all();
		const own = here.find((r) => r.uploadedBy === actorId);
		// The same file again (a resubmitted form) changes nothing.
		if (own?.replayId === replayId && own.data.equals(data))
			return { game, saved: true, replaced: true };
		// A series finished in a second RiftAtlas room has two files that say "game 1": the file's
		// own number never puts it in a game holding another one's file, only a chosen game does. Nor
		// does the opponent's file of this RiftAtlas game replace the uploader's file of another.
		if (asGame === undefined && (own ? own.replayId !== replayId : !known.length && here.length))
			return { game, saved: false, held: own ? 'own' : 'theirs' };
		// The uploader's file of this RiftAtlas game moves along when they choose another game.
		tx.delete(replays)
			.where(
				and(
					eq(replays.matchId, m.id),
					eq(replays.uploadedBy, actorId),
					or(eq(replays.game, game), eq(replays.replayId, replayId))
				)
			)
			.run();
		tx.insert(replays)
			.values({ matchId: m.id, game, replayId, uploadedBy: actorId, bothSides, data })
			.run();
		log(tx, m, actorId, { replay: game });
		return { game, saved: true, replaced: !!own };
	});
}

// `uploaderId`'s file of the game. Who may delete it is the caller's to check.
export const deleteReplay = (m: Match, actorId: string, game: number, uploaderId: string) =>
	db.transaction((tx) => {
		const file = and(slot(m.id, game), eq(replays.uploadedBy, uploaderId));
		if (!tx.delete(replays).where(file).run().changes) return false;
		// Nothing left to publish: "both published" keeps meaning "has a public replay".
		if (!tx.select({ game: replays.game }).from(replays).where(eq(replays.matchId, m.id)).get())
			unpublish(tx, [m.id]);
		log(tx, m, actorId, { replayDeleted: game });
		return true;
	});

// One of the two players says yes or no to showing the match's replays to everyone.
export const setPublish = (m: Match, playerId: string, on: boolean) =>
	db.transaction((tx) => {
		if (!inMatch(m, playerId)) throw new Error(`${playerId} is not in match ${m.id}`);
		// Nothing to publish; this also keeps "both published" meaning "has a public replay".
		if (
			on &&
			!tx.select({ game: replays.game }).from(replays).where(eq(replays.matchId, m.id)).get()
		)
			return false;
		// Said already (a resubmitted form): no second line in the log.
		if ((playerId === m.p1Id ? m.p1PublishReplay : m.p2PublishReplay) === on) return true;
		tx.update(matches)
			.set(playerId === m.p1Id ? { p1PublishReplay: on } : { p2PublishReplay: on })
			.where(eq(matches.id, m.id))
			.run();
		log(tx, m, playerId, { replayPublished: on });
		return true;
	});
