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

// The games that have a replay, without the files.
export const matchReplays = (matchId: number) =>
	db
		.select({ game: replays.game, uploadedBy: replays.uploadedBy, createdAt: replays.createdAt })
		.from(replays)
		.where(eq(replays.matchId, matchId))
		.orderBy(asc(replays.game))
		.all();

export const replayFileName = (slug: string, matchId: number, game: number) =>
	`poroleague-${slug}-match-${matchId}-game-${game}.json`;

// One entry per played game, for the match page; `replay` is null where nobody added one.
export function replaySlots(m: Match, slug: string, name: (playerId: string) => string) {
	const held = new Map(matchReplays(m.id).map((r) => [r.game, r]));
	const played = m.games?.length ?? (m.p1Games ?? 0) + (m.p2Games ?? 0);
	return Array.from({ length: played }, (_, i) => {
		const r = held.get(i + 1);
		return {
			game: i + 1,
			replay: r
				? {
						by: name(r.uploadedBy),
						when: day(leagueDate(r.createdAt)),
						file: replayFileName(slug, m.id, i + 1)
					}
				: null
		};
	});
}

const slot = (matchId: number, game: number) =>
	and(eq(replays.matchId, matchId), eq(replays.game, game));

// The JSON file as RiftAtlas wrote it, still gzipped: downloads go out that way.
export const replayGzip = (matchId: number, game: number) =>
	db.select({ data: replays.data }).from(replays).where(slot(matchId, game)).get()?.data;

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

// Stores the file as `asGame` of the match, or as the game it says it is. Returns why not, or the
// game: saved, or (`saved: false`, nothing stored) holding another replay, so the player has to say
// which game the file is. `unpublished`: saving took a Publish back. `since`: nothing older can be
// a game of this season.
export function saveReplay(
	m: Match,
	since: Date,
	actorId: string,
	text: string,
	asGame?: number
): string | { game: number; saved: boolean; unpublished?: boolean } {
	if (Buffer.byteLength(text) > MAX_REPLAY_BYTES) return TOO_BIG;
	const read = readReplay(text);
	if (!read.ok) return read.error;
	const { replayId } = read.info;
	const game = asGame ?? read.info.game;
	const error = checkReplay({ ...read.info, game }, m, new Date(), since);
	if (error) return error;
	const data = gzipSync(text);
	return db.transaction((tx) => {
		// Erasure deleted this match's replays; a new one would bring the erased player's name back.
		const erased = tx
			.select({ id: players.id })
			.from(players)
			.where(and(inArray(players.id, [m.p1Id, m.p2Id]), isNotNull(players.erasedAt)))
			.get();
		if (erased) return 'A player of this match was erased, so it keeps no replays.';
		const same = tx.select().from(replays).where(eq(replays.replayId, replayId)).get();
		if (same && same.matchId !== m.id) return 'This replay is already on another match.';
		// The same file again (a resubmitted form) changes nothing, so nobody's publish is undone.
		if (same?.game === game && same.data.equals(data)) return { game, saved: true };
		// A series finished in a second RiftAtlas room has two files that say "game 1": the file's
		// own number never replaces another game's replay, only a game the uploader chose does.
		const held = tx
			.select({ replayId: replays.replayId })
			.from(replays)
			.where(slot(m.id, game))
			.get();
		if (asGame === undefined && held && held.replayId !== replayId) return { game, saved: false };
		tx.delete(replays)
			.where(or(slot(m.id, game), eq(replays.replayId, replayId)))
			.run();
		tx.insert(replays).values({ matchId: m.id, game, replayId, uploadedBy: actorId, data }).run();
		unpublish(tx, [m.id]);
		log(tx, m, actorId, { replay: game });
		return { game, saved: true, unpublished: m.p1PublishReplay || m.p2PublishReplay };
	});
}

export const deleteReplay = (m: Match, actorId: string, game: number) =>
	db.transaction((tx) => {
		if (!tx.delete(replays).where(slot(m.id, game)).run().changes) return false;
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
