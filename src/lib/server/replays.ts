import { gunzipSync, gzipSync } from 'node:zlib';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { checkReplay, readReplay } from '#lib/replay.ts';
import { db } from '#lib/server/db/index.ts';
import { audit, matches, replays } from '#lib/server/db/schema.ts';
import type { Match, Tx } from '#lib/server/matches.ts';

export const MAX_REPLAY_BYTES = 5 * 1024 * 1024;

const inMatch = (m: Match, playerId: string) => playerId === m.p1Id || playerId === m.p2Id;

// A replay shows its uploader's deck and hand: the two players and organizers see it, everyone
// else only once both players have published.
export const canSeeReplays = (m: Match, viewerId: string | null, organizer = false) =>
	(m.p1PublishReplay && m.p2PublishReplay) || organizer || (!!viewerId && inMatch(m, viewerId));

// The games that have a replay, without the files.
export const matchReplays = (matchId: number) =>
	db
		.select({ game: replays.game, uploadedBy: replays.uploadedBy, createdAt: replays.createdAt })
		.from(replays)
		.where(eq(replays.matchId, matchId))
		.orderBy(asc(replays.game))
		.all();

const slot = (matchId: number, game: number) =>
	and(eq(replays.matchId, matchId), eq(replays.game, game));

// The JSON file as RiftAtlas wrote it.
export function replayFile(matchId: number, game: number) {
	const row = db.select({ data: replays.data }).from(replays).where(slot(matchId, game)).get();
	return row && gunzipSync(row.data);
}

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

// Stores the file in the slot of the game it says it is, replacing what was there. Returns why
// not, or null when saved. `since`: nothing older can be a game of this season.
export function saveReplay(m: Match, since: Date, actorId: string, text: string): string | null {
	if (Buffer.byteLength(text) > MAX_REPLAY_BYTES) return 'A replay file can be 5 MB at most.';
	const read = readReplay(text);
	if (!read.ok) return read.error;
	const { replayId, game } = read.info;
	const error = checkReplay(read.info, m, new Date(), since);
	if (error) return error;
	return db.transaction((tx) => {
		const taken = tx
			.select({ matchId: replays.matchId })
			.from(replays)
			.where(eq(replays.replayId, replayId))
			.get();
		if (taken && taken.matchId !== m.id) return 'This replay is already on another match.';
		tx.delete(replays).where(slot(m.id, game)).run();
		tx.insert(replays)
			.values({ matchId: m.id, game, replayId, uploadedBy: actorId, data: gzipSync(text) })
			.run();
		unpublish(tx, [m.id]);
		log(tx, m, actorId, { replay: game });
		return null;
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
		tx.update(matches)
			.set(playerId === m.p1Id ? { p1PublishReplay: on } : { p2PublishReplay: on })
			.where(eq(matches.id, m.id))
			.run();
		log(tx, m, playerId, { replayPublished: on });
	});
