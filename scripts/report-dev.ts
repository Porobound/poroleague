// Dev only: reports a match as the player who isn't you, so the flag flow can be tested.
// Writes the audit row like the app does; posts nothing to Discord.
import Database from 'better-sqlite3';

process.loadEnvFile();
const [id, discordId] = process.argv.slice(2);
if (!id || !discordId)
	throw new Error('usage: npm run db:report-dev -- <match-id> <your-discord-id>');

const db = new Database(process.env.DATABASE_URL!);
const player = db.prepare('select id from players where discord_id = ?').get(discordId) as
	{ id: string } | undefined;
if (!player) throw new Error(`No player with Discord id ${discordId}; log in on the site first`);
const me = player.id;
const m = db.prepare('select * from matches where id = ?').get(Number(id)) as
	| {
			id: number;
			season_id: number;
			stage: string;
			p1_id: string;
			p2_id: string;
			reported_by: string | null;
	  }
	| undefined;
if (!m) throw new Error(`No match ${id}`);
// A top-cut report also has to move the bracket on, which only the app does.
if (m.stage === 'playoff')
	throw new Error(`Match ${id} is in the top cut; report it on the site as the other player`);
if (m.reported_by) throw new Error(`Match ${id} is already reported`);
const other = m.p1_id === me ? m.p2_id : m.p2_id === me ? m.p1_id : null;
if (!other) throw new Error(`${discordId} doesn't play match ${id}`);

const after = { p1Games: 2, p2Games: 0, p1Legend: 'Jinx', p2Legend: 'Ahri', diceWinnerId: other };
db.transaction(() => {
	db.prepare(
		`update matches set p1_games = 2, p2_games = 0, p1_legend = 'Jinx', p2_legend = 'Ahri',
		 dice_winner_id = ?, reported_by = ?, reported_at = unixepoch() where id = ?`
	).run(other, other, m.id);
	db.prepare(
		`insert into audit (season_id, match_id, actor_id, action, after) values (?, ?, ?, 'report', ?)`
	).run(m.season_id, m.id, other, JSON.stringify(after));
})();
console.log(`Match ${id} reported 2-0 by ${other}.`);
