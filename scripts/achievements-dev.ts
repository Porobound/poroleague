// Dev only: grants (dated now) or clears your achievements, to check rows, locked and progress
// states, and long names. `none` clears them and your equipped cosmetics; the next app start
// re-awards what your results earned.
import Database from 'better-sqlite3';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';

process.loadEnvFile();
const [discordId, ...what] = process.argv.slice(2);
if (!discordId || !what.length)
	throw new Error('usage: npm run db:achievements-dev -- <your-discord-id> <all|none|id…>');
const db = new Database(process.env.DATABASE_URL!);
const me = db.prepare('select id from players where discord_id = ?').get(discordId) as
	{ id: string } | undefined;
if (!me) throw new Error(`No player with Discord id ${discordId}; log in on the site first`);
const known = new Set(ACHIEVEMENTS.map((a) => a.id));
const ids = what.filter((w) => w !== 'all' && w !== 'none');
const unknown = ids.filter((id) => !known.has(id));
if (unknown.length)
	throw new Error(
		`Unknown achievement ${unknown.join(', ')}; ids are in src/lib/league/achievements.ts`
	);
db.transaction(() => {
	if (what.includes('none')) {
		db.prepare('delete from player_achievements where player_id = ?').run(me.id);
		// Equipped cosmetics must stay earned.
		db.prepare(
			'update players set title_achievement = null, badge_achievement = null, frame_tier = null where id = ?'
		).run(me.id);
	}
	const add = db.prepare(
		'insert or ignore into player_achievements (player_id, achievement_id, unlocked_at) values (?, ?, unixepoch())'
	);
	for (const id of what.includes('all') ? known : ids) add.run(me.id, id);
})();
const { n } = db
	.prepare('select count(*) n from player_achievements where player_id = ?')
	.get(me.id) as { n: number };
console.log(`You have ${n} of ${known.size} achievements.`);
