// Dev only: signs up N fake players to a season so group draws can be tested with one real account.
import Database from 'better-sqlite3';
import { GROUP_SIZE, MAX_PLAYERS } from '#lib/league/groups.ts';

process.loadEnvFile();
const [slug, count = '24'] = process.argv.slice(2);
if (!slug) throw new Error('usage: npm run db:seed-dev -- <season-slug> [count]');

const db = new Database(process.env.DATABASE_URL!);
const season = db.prepare('select id, status from seasons where slug = ?').get(slug) as
	{ id: number; status: string } | undefined;
if (!season) throw new Error(`No season with slug "${slug}"`);
if (season.status === 'play' || season.status === 'finished')
	throw new Error(`"${slug}" is locked; its schedule already exists.`);

// While groups are being drawn, new players join the smallest group so they show up in the draw.
const smallestGroup = db.prepare(
	'select group_no as g from entries where season_id = ? and group_no is not null group by group_no order by count(*), group_no limit 1'
);
const addPlayer = db.prepare('insert or ignore into players (id, display_name) values (?, ?)');
const addEntry = db.prepare(
	'insert or ignore into entries (season_id, player_id, group_no) values (?, ?, ?)'
);
const total = db.prepare('select count(*) n from entries where season_id = ?');
const biggestGroup = db.prepare(
	'select count(*) n from entries where season_id = ? and group_no is not null group by group_no order by n desc limit 1'
);
// All or nothing: a seed that would break the app's limits writes no one.
db.transaction(() => {
	for (let i = 1; i <= Number(count); i++) {
		const group =
			season.status === 'groups'
				? ((smallestGroup.get(season.id) as { g: number } | undefined)?.g ?? 1)
				: null;
		addPlayer.run(`dev-${i}`, `Dev Player ${i}`);
		addEntry.run(season.id, `dev-${i}`, group);
	}
	const n = (total.get(season.id) as { n: number }).n;
	if (n > MAX_PLAYERS)
		throw new Error(`That makes ${n} players; a season takes at most ${MAX_PLAYERS}.`);
	const biggest = (biggestGroup.get(season.id) as { n: number } | undefined)?.n ?? 0;
	if (biggest > GROUP_SIZE)
		throw new Error(`A group would have ${biggest} players; groups hold at most ${GROUP_SIZE}.`);
})();
console.log(`Signed up ${count} dev players to ${slug}.`);
