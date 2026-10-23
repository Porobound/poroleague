// Dev only: plays out a locked season with fake results so standings, schedule, legends and audit
// have data. Reports only dev-vs-dev matches, so your own matches stay yours to report.
// Same seed + same season = same results. Writes audit rows like the app; posts nothing to Discord.
import Database from 'better-sqlite3';
import { LEGENDS } from '#lib/legends.ts';

process.loadEnvFile();
const args = process.argv.slice(2);
const [slug, share = '0.6'] = args.filter((a) => !a.startsWith('--'));
if (!slug) throw new Error('usage: npm run db:play-dev -- <season-slug> [share=0.6] [--drop]');

const db = new Database(process.env.DATABASE_URL!);
const season = db.prepare('select id, status from seasons where slug = ?').get(slug) as
	{ id: number; status: string } | undefined;
if (!season) throw new Error(`No season with slug "${slug}"`);
if (season.status !== 'play') throw new Error(`"${slug}" isn't in play; lock the groups first.`);

// mulberry32: tiny seeded PRNG so reruns on a fresh season give the same picture.
let seed = season.id * 2654435761;
const rand = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

// Each dev player has a main legend and sometimes plays something else; a small pool makes mirrors.
const pool = LEGENDS.slice(0, 12);
const main = (id: string) => pool[Number(id.slice(4)) % pool.length];
const legendOf = (id: string) => (rand() < 0.75 ? main(id) : pick(pool));
const SCORES = [
	[2, 0],
	[2, 0],
	[2, 1],
	[2, 1],
	[1, 2],
	[0, 2],
	[1, 1]
] as const;

type M = { id: number; p1_id: string; p2_id: string };
const open = db
	.prepare(
		`select id, p1_id, p2_id from matches where season_id = ? and reported_by is null
		 and p1_id like 'dev-%' and p2_id like 'dev-%'
		 and round <= (select published_round from seasons where id = matches.season_id)
		 order by round, id`
	)
	.all(season.id) as M[];

const report = db.prepare(
	`update matches set p1_games = ?, p2_games = ?, p1_legend = ?, p2_legend = ?, dice_winner_id = ?,
	 reported_by = ?, reported_at = unixepoch() where id = ?`
);
const flag = db.prepare(`update matches set flagged_by = ?, flag_reason = ? where id = ?`);
const log = db.prepare(
	`insert into audit (season_id, match_id, actor_id, action, before, after) values (?, ?, ?, ?, ?, ?)`
);

// The first `share` of the schedule gets played, with ~10% left as gaps so some matches go overdue.
const played = open.slice(0, Math.round(open.length * Number(share))).filter(() => rand() > 0.1);
let flags = 0;
db.transaction(() => {
	for (const m of played) {
		const [p1Games, p2Games] = pick(SCORES);
		const r = {
			p1Games,
			p2Games,
			p1Legend: legendOf(m.p1_id),
			p2Legend: legendOf(m.p2_id),
			diceWinnerId: pick([m.p1_id, m.p2_id])
		};
		const by = pick([m.p1_id, m.p2_id]);
		report.run(r.p1Games, r.p2Games, r.p1Legend, r.p2Legend, r.diceWinnerId, by, m.id);
		log.run(season.id, m.id, by, 'report', null, JSON.stringify(r));
		if (rand() < 0.05) {
			const who = by === m.p1_id ? m.p2_id : m.p1_id;
			const reason = 'Wrong score, it was the other way round.';
			flag.run(who, reason, m.id);
			log.run(season.id, m.id, who, 'flag', null, JSON.stringify({ flagReason: reason }));
			flags++;
		}
	}
	if (args.includes('--drop')) {
		const victim = db
			.prepare(
				`select player_id as id from entries where season_id = ? and player_id like 'dev-%'
				 and dropped = 0 order by player_id desc limit 1`
			)
			.get(season.id) as { id: string } | undefined;
		// Drops are an organizer action; the first real player in the season stands in for one.
		const actor = db
			.prepare(
				`select player_id as id from entries where season_id = ? and player_id not like 'dev-%' limit 1`
			)
			.get(season.id) as { id: string } | undefined;
		if (victim) {
			db.prepare('update entries set dropped = 1 where season_id = ? and player_id = ?').run(
				season.id,
				victim.id
			);
			log.run(
				season.id,
				null,
				actor?.id ?? victim.id,
				'drop',
				null,
				JSON.stringify({ dropped: victim.id })
			);
		}
	}
})();
console.log(
	`Reported ${played.length} of ${open.length} open dev matches (${flags} flagged)` +
		(args.includes('--drop') ? ', dropped one dev player.' : '.')
);
