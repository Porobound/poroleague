// Seeds the throwaway e2e database (already migrated) with fixed data.
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { ORGANIZER, SEASONS, player, playerName, token, type SeasonKey } from './fixtures.ts';

const path = process.env.DATABASE_URL;
if (!path || /(^|\/)local\.db$/.test(path)) throw new Error('e2e needs its own DATABASE_URL');

const db = new Database(path);
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const ROUNDS = [
	[1, 1, 2],
	[1, 3, 4],
	[2, 1, 3],
	[2, 2, 4],
	[3, 1, 4],
	[3, 2, 3]
];

const addPlayer = db.prepare('insert into players (id, display_name) values (?, ?)');
const addSeason = db.prepare(
	"insert into seasons (slug, name, status, published_round) values (?, ?, 'play', ?) returning id"
);
const addEntry = db.prepare(
	'insert into entries (season_id, player_id, group_no) values (?, ?, 1)'
);
const addMatch = db.prepare(
	'insert into matches (id, season_id, group_no, round, p1_id, p2_id) values (?, ?, 1, ?, ?, ?)'
);
const addSession = db.prepare(
	"insert into sessions (id, player_id, access_token, is_organizer, expires_at) values (?, ?, 'e2e', ?, ?)"
);
const expires = Math.floor(Date.now() / 1000) + 24 * 3600;

db.transaction(() => {
	addPlayer.run(ORGANIZER, 'Org');
	addSession.run(hash(token(ORGANIZER)), ORGANIZER, 1, expires);
	for (const [key, s] of Object.entries(SEASONS) as [SeasonKey, (typeof SEASONS)[SeasonKey]][]) {
		const { id } = addSeason.get(s.slug, `E2E ${key}`, s.publishedRound) as { id: number };
		for (let n = 1; n <= 4; n++) {
			addPlayer.run(player(key, n), playerName(key, n));
			addEntry.run(id, player(key, n));
			addSession.run(hash(token(player(key, n))), player(key, n), 0, expires);
		}
		ROUNDS.forEach(([round, a, b], i) =>
			addMatch.run(s.first + i, id, round, player(key, a), player(key, b))
		);
	}
})();
db.close();
