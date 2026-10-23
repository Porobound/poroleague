// Seeds the throwaway e2e database (already migrated) with fixed data.
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { PUBLISHED_MATCH, SLUG, TOKENS, UNPUBLISHED_MATCH } from './fixtures.ts';

const path = process.env.DATABASE_URL;
if (!path || /(^|\/)local\.db$/.test(path)) throw new Error('e2e needs its own DATABASE_URL');

const db = new Database(path);
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const players = ['p1', 'p2', 'p3', 'p4'];

db.transaction(() => {
	const player = db.prepare('insert into players (id, display_name) values (?, ?)');
	players.forEach((id, i) => player.run(id, `Player ${i + 1}`));
	const { id: season } = db
		.prepare(
			"insert into seasons (slug, name, status, published_round) values (?, 'E2E Season', 'play', 1) returning id"
		)
		.get(SLUG) as { id: number };
	const entry = db.prepare('insert into entries (season_id, player_id, group_no) values (?, ?, 1)');
	for (const id of players) entry.run(season, id);
	// Round robin of four: rounds 2 and 3 are unpublished.
	const match = db.prepare(
		'insert into matches (id, season_id, group_no, round, p1_id, p2_id) values (?, ?, 1, ?, ?, ?)'
	);
	[
		[PUBLISHED_MATCH, 1, 'p1', 'p2'],
		[2, 1, 'p3', 'p4'],
		[UNPUBLISHED_MATCH, 2, 'p1', 'p3'],
		[4, 2, 'p2', 'p4'],
		[5, 3, 'p1', 'p4'],
		[6, 3, 'p2', 'p3']
	].forEach(([id, round, p1, p2]) => match.run(id, season, round, p1, p2));
	const session = db.prepare(
		"insert into sessions (id, player_id, access_token, is_organizer, expires_at) values (?, ?, 'e2e', ?, ?)"
	);
	const expires = Math.floor(Date.now() / 1000) + 24 * 3600;
	session.run(hash(TOKENS.player), 'p1', 0, expires);
	session.run(hash(TOKENS.organizer), 'p4', 1, expires);
})();
db.close();
