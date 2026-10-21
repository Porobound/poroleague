// Dev only: signs up N fake players to a season so group draws can be tested with one real account.
import Database from 'better-sqlite3';

process.loadEnvFile();
const [slug, count = '24'] = process.argv.slice(2);
if (!slug) throw new Error('usage: npm run db:seed-dev -- <season-slug> [count]');

const db = new Database(process.env.DATABASE_URL!);
const season = db.prepare('select id from seasons where slug = ?').get(slug) as
	{ id: number } | undefined;
if (!season) throw new Error(`No season with slug "${slug}"`);

const addPlayer = db.prepare('insert or ignore into players (id, display_name) values (?, ?)');
const addEntry = db.prepare('insert or ignore into entries (season_id, player_id) values (?, ?)');
for (let i = 1; i <= Number(count); i++) {
	addPlayer.run(`dev-${i}`, `Dev Player ${i}`);
	addEntry.run(season.id, `dev-${i}`);
}
console.log(`Signed up ${count} dev players to ${slug}.`);
