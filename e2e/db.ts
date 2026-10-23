// Direct writes to the e2e database, for seeding what a flow starts from. The site allows one
// running season at a time, so each spec seeds its own in beforeAll and removes it in afterAll.
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { DB, ORGANIZER, SEASONS, player, playerName, token, type SeasonKey } from './fixtures.ts';

type Db = Database.Database;
const ROUNDS = [
	[1, 1, 2],
	[1, 3, 4],
	[2, 1, 3],
	[2, 2, 4],
	[3, 1, 4],
	[3, 2, 3]
];

function write(fn: (db: Db) => void) {
	const db = new Database(DB);
	try {
		db.transaction(fn)(db);
	} finally {
		db.close();
	}
}

// A player with a day-long session; log in with `as(id)`.
function addPlayer(db: Db, id: string, name: string, organizer = false) {
	db.prepare('insert or ignore into players (id, display_name) values (?, ?)').run(id, name);
	db.prepare(
		"insert or ignore into sessions (id, player_id, access_token, is_organizer, expires_at) values (?, ?, 'e2e', ?, ?)"
	).run(
		createHash('sha256').update(token(id)).digest('hex'),
		id,
		organizer ? 1 : 0,
		Math.floor(Date.now() / 1000) + 24 * 3600
	);
}

const addPlayers = (db: Db, key: SeasonKey, count: number) => {
	for (let n = 1; n <= count; n++) addPlayer(db, player(key, n), playerName(key, n));
};

export const seedOrganizer = () => write((db) => addPlayer(db, ORGANIZER, 'Org', true));

// The flow's players, in no season.
export const seedPlayers = (key: SeasonKey, count: number) =>
	write((db) => addPlayers(db, key, count));

// Signs up players `from`…`to` of the flow to its season, as if they joined through the site.
export const seedEntries = (key: SeasonKey, from: number, to: number) =>
	write((db) => {
		const add = db.prepare(
			'insert into entries (season_id, player_id) select id, ? from seasons where slug = ?'
		);
		for (let n = from; n <= to; n++) add.run(player(key, n), SEASONS[key]);
	});

// Four players in a season in play, one group, the full round robin scheduled. Returns the match
// ids in schedule order: round 1: 1v2, 3v4 · round 2: 1v3, 2v4 · round 3: 1v4, 2v3.
export function seedSeason(key: SeasonKey, values: { publishedRound: number; deadline?: string }) {
	const ids: number[] = [];
	write((db) => {
		unlist(db, key);
		addPlayers(db, key, 4);
		const { id } = db
			.prepare(
				"insert into seasons (slug, name, status, published_round, deadline) values (?, ?, 'play', ?, ?) returning id"
			)
			.get(SEASONS[key], `E2E ${key}`, values.publishedRound, values.deadline ?? null) as {
			id: number;
		};
		for (let n = 1; n <= 4; n++)
			db.prepare('insert into entries (season_id, player_id, group_no) values (?, ?, 1)').run(
				id,
				player(key, n)
			);
		const add = db.prepare(
			'insert into matches (season_id, group_no, round, p1_id, p2_id) values (?, 1, ?, ?, ?) returning id'
		);
		for (const [round, a, b] of ROUNDS)
			ids.push((add.get(id, round, player(key, a), player(key, b)) as { id: number }).id);
	});
	return ids;
}

// A result reported by p1 (Ahri vs Annie, p1 won the roll), optionally flagged by p2.
export const seedResult = (matchId: number, p1Games: number, p2Games: number, flag?: string) =>
	write((db) =>
		db
			.prepare(
				`update matches set p1_games = ?, p2_games = ?, p1_legend = 'Ahri', p2_legend = 'Annie',
				 dice_winner_id = p1_id, reported_by = p1_id, reported_at = unixepoch(),
				 flagged_by = iif(? is null, null, p2_id), flag_reason = ? where id = ?`
			)
			.run(p1Games, p2Games, flag ?? null, flag ?? null, matchId)
	);

// Soft-deletes the flow's season and frees its slug, as the site does, so the next flow can have a
// running season of its own and a rerun after a failure can seed it again.
const unlist = (db: Db, key: SeasonKey) =>
	db
		.prepare("update seasons set deleted_at = unixepoch(), slug = slug || '~' || id where slug = ?")
		.run(SEASONS[key]);
export const removeSeason = (key: SeasonKey) => write((db) => unlist(db, key));
