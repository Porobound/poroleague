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
	db.prepare('insert into players (id, display_name) values (?, ?)').run(id, name);
	db.prepare(
		"insert into sessions (id, player_id, access_token, is_organizer, expires_at) values (?, ?, 'e2e', ?, ?)"
	).run(
		createHash('sha256').update(token(id)).digest('hex'),
		id,
		organizer ? 1 : 0,
		Math.floor(Date.now() / 1000) + 24 * 3600
	);
}

const addPlayers = (db: Db, key: SeasonKey) => {
	for (let n = 1; n <= 4; n++) addPlayer(db, player(key, n), playerName(key, n));
};

export const seedOrganizer = () => write((db) => addPlayer(db, ORGANIZER, 'Org', true));

// The flow's four players, in no season.
export const seedPlayers = (key: SeasonKey) => write((db) => addPlayers(db, key));

// The flow's players in a season in play, one group, the full round robin scheduled.
export const seedSeason = (key: SeasonKey, values: { publishedRound: number; deadline?: string }) =>
	write((db) => {
		const { slug, first } = SEASONS[key];
		addPlayers(db, key);
		const { id } = db
			.prepare(
				"insert into seasons (slug, name, status, published_round, deadline) values (?, ?, 'play', ?, ?) returning id"
			)
			.get(slug, `E2E ${key}`, values.publishedRound, values.deadline ?? null) as { id: number };
		for (let n = 1; n <= 4; n++)
			db.prepare('insert into entries (season_id, player_id, group_no) values (?, ?, 1)').run(
				id,
				player(key, n)
			);
		ROUNDS.forEach(([round, a, b], i) =>
			db
				.prepare(
					'insert into matches (id, season_id, group_no, round, p1_id, p2_id) values (?, ?, 1, ?, ?, ?)'
				)
				.run(first + i, id, round, player(key, a), player(key, b))
		);
	});

// Soft-deletes the flow's season, so the next flow can have a running season of its own.
export const removeSeason = (key: SeasonKey) =>
	write((db) =>
		db.prepare('update seasons set deleted_at = unixepoch() where slug = ?').run(SEASONS[key].slug)
	);
