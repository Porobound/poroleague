// Dev only: backs up the dev DB, wipes it (keeping your player and session) and seeds three seasons:
// Summer finished (counts-only results), Autumn in play (per-game results, flags, a drop, an erased
// player; your rounds 5+ left open), Winter draft. Same run = same data. Posts nothing to Discord.
// DEV_DISCORD_IDS (comma-separated, in .env) gives the first fake players real Discord ids.
import Database from 'better-sqlite3';
import { LEGENDS } from '#lib/legends.ts';
import { roundRobin } from '#lib/league/roundRobin.ts';
import { scoreGames } from '#lib/league/score.ts';

process.loadEnvFile();
const [discordId] = process.argv.slice(2);
if (!discordId) throw new Error('usage: npm run db:reseed-dev -- <your-discord-id>');

const file = process.env.DATABASE_URL!;
const db = new Database(file);
const me = db.prepare('select id from players where discord_id = ?').get(discordId) as
	{ id: string } | undefined;
if (!me) throw new Error(`No player with Discord id ${discordId}; log in on the site first`);
const ME = me.id;
const backup = file.replace(/\.db$/, '') + `.${new Date().toISOString().slice(0, 10)}.bak.db`;
await db.backup(backup);
db.pragma('foreign_keys = ON');

let seed = 79;
const rand = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)];
const shuffle = <T>(l: T[]) =>
	l
		.map((x) => [rand(), x] as const)
		.sort((a, b) => a[0] - b[0])
		.map((x) => x[1]);

const REAL = (process.env.DEV_DISCORD_IDS ?? '').split(',').filter(Boolean);
const NICKS = [
	'Pengu',
	'nightowl',
	'Big Tony',
	'Big Mo',
	'rift_rat',
	'Kaiju',
	'Tofu',
	'zed main btw',
	'Mochi',
	'Glacier',
	'xXPoroXx',
	'sunny',
	'Captain Crab',
	'lowroller',
	'Bramble',
	'dicegoblin',
	'Hexgate Harry',
	'Momo',
	'Frostbite',
	'Kettle',
	'Biscuit',
	'noodle',
	'ArcaneAndy'
];
const pool = LEGENDS.slice(0, 14);
type Result = {
	games: string | null;
	p1Games: number;
	p2Games: number;
	p1Legend: string;
	p2Legend: string;
	diceWinnerId: string;
};
type M = { id: number; round: number; a: string; b: string; reported?: Result; by?: string };

db.transaction(() => {
	db.prepare(`delete from sessions where player_id <> ?`).run(ME);
	db.exec(`
		delete from audit; delete from matches; delete from entries; delete from seasons;
		delete from sqlite_sequence where name in ('audit', 'matches', 'seasons');
	`);
	db.prepare('delete from players where id <> ?').run(ME);
	const ids = NICKS.map((n, i) => {
		const id = `dev${String(i + 1).padStart(13, '0')}`;
		db.prepare('insert into players (id, discord_id, display_name) values (?, ?, ?)').run(
			id,
			REAL[i] ?? `dev-${i + 1}`,
			n
		);
		return id;
	});
	const skill = new Map([ME, ...ids].map((id) => [id, 0.3 + rand() * 0.4]));
	const main = new Map([ME, ...ids].map((id) => [id, pick(pool)]));
	const legend = (id: string) => (rand() < 0.75 ? main.get(id)! : pick(pool));

	const addSeason = db.prepare(
		`insert into seasons (slug, name, status, start_date, rounds_per_week, deadline, top_cut_size, published_round, created_at)
		 values (?, ?, ?, ?, 2, ?, 4, ?, ?) returning id`
	);
	const addEntry = db.prepare(
		'insert into entries (season_id, player_id, group_no) values (?, ?, ?)'
	);
	const addMatch = db.prepare(
		'insert into matches (season_id, group_no, round, p1_id, p2_id) values (?, ?, ?, ?, ?) returning id'
	);
	const report = db.prepare(
		`update matches set games = ?, p1_games = ?, p2_games = ?, p1_legend = ?, p2_legend = ?, dice_winner_id = ?,
		 reported_by = ?, reported_at = ? where id = ?`
	);
	const log = db.prepare(
		'insert into audit (season_id, match_id, actor_id, action, before, after, created_at) values (?, ?, ?, ?, ?, ?, ?)'
	);
	// Unix time in the week a round was played.
	const at = (start: string, round: number) =>
		Math.floor(new Date(start).getTime() / 1000) +
		Math.ceil(round / 2) * 7 * 86400 -
		2 * 86400 +
		Math.floor(rand() * 86400);

	// Who won each game ('1', '2' or 'D'); a match can be called on time after any game.
	function play(a: string, b: string, perGame: boolean) {
		if (perGame && rand() < 0.05)
			return { games: pick(['D', 'DD', 'DDD']), p1Games: 0, p2Games: 0 };
		for (;;) {
			let g = '';
			const w = { '1': 0, '2': 0 };
			while (g.length < 3 && w['1'] < 2 && w['2'] < 2) {
				const r = rand();
				const x =
					r < 0.06 ? 'D' : r < 0.06 + 0.94 * (0.5 + skill.get(a)! - skill.get(b)!) ? '1' : '2';
				g += x;
				if (x !== 'D') w[x]++;
				if (g.length < 3 && rand() < 0.04) break;
			}
			const s = scoreGames([...g.padEnd(3, ' ')].map((c) => c.trim()));
			if (s.ok) return { games: perGame ? s.games : null, p1Games: s.p1, p2Games: s.p2 };
		}
	}

	function season(o: {
		slug: string;
		name: string;
		status: string;
		start: string;
		deadline: string;
		published: number;
		players: string[];
		groups: number;
		played: (round: number, a: string, b: string) => boolean;
		perGame: (round: number) => boolean;
	}) {
		const sid = (
			addSeason.get(
				o.slug,
				o.name,
				o.status,
				o.start,
				o.deadline,
				o.published,
				at(o.start, -6)
			) as {
				id: number;
			}
		).id;
		const ms: M[] = [];
		for (let g = 0; g < o.groups; g++) {
			const list = o.players.filter((_, i) => i % o.groups === g);
			for (const p of list) addEntry.run(sid, p, g + 1);
			roundRobin(list).forEach((round, ri) => {
				for (const [a, b] of round)
					ms.push({
						id: (addMatch.get(sid, g + 1, ri + 1, a, b) as { id: number }).id,
						round: ri + 1,
						a,
						b
					});
			});
		}
		for (const m of ms) {
			if (m.round > o.published || !o.played(m.round, m.a, m.b)) continue;
			const r: Result = {
				...play(m.a, m.b, o.perGame(m.round)),
				p1Legend: legend(m.a),
				p2Legend: legend(m.b),
				diceWinnerId: pick([m.a, m.b])
			};
			const by = pick([m.a, m.b]);
			const t = at(o.start, m.round);
			report.run(
				r.games,
				r.p1Games,
				r.p2Games,
				r.p1Legend,
				r.p2Legend,
				r.diceWinnerId,
				by,
				t,
				m.id
			);
			log.run(sid, m.id, by, 'report', null, JSON.stringify(r), t);
			Object.assign(m, { reported: r, by });
		}
		for (let w = 1; w * 2 <= o.published; w++)
			log.run(
				sid,
				null,
				ME,
				'publish',
				null,
				JSON.stringify({ week: w, rounds: [w * 2 - 1, w * 2] }),
				at(o.start, w * 2 - 2)
			);
		return { sid, ms };
	}

	const summer = season({
		slug: 'summer-2026',
		name: 'Summer 2026',
		status: 'finished',
		start: '2026-07-06',
		deadline: '2026-08-16',
		published: 9,
		players: [ME, ...ids.slice(0, 9)],
		groups: 1,
		played: () => rand() > 0.07,
		perGame: () => false
	});
	log.run(summer.sid, null, ME, 'finalize', null, null, at('2026-07-06', 14));

	const autumn = season({
		slug: 'autumn-2026',
		name: 'Autumn 2026',
		status: 'play',
		start: '2026-10-05',
		deadline: '2026-11-22',
		published: 8,
		players: shuffle([ME, ...ids]),
		groups: 2,
		played: (round, a, b) =>
			a === ME || b === ME
				? round <= 4
				: round <= 4
					? rand() > 0.05
					: round <= 6
						? rand() > 0.35
						: rand() > 0.85,
		perGame: (round) => round > 1 || rand() > 0.3
	});

	// Flags: five open, one fixed by an organizer edit, one kept as reported.
	const reasons = [
		'It was 2-1, not 2-0. We played a third game.',
		'Wrong legend, I was on Jinx.',
		'I won the dice roll, not them.',
		'Game 2 was a draw, not a win.',
		'Score is the wrong way round.'
	];
	const flag = db.prepare('update matches set flagged_by = ?, flag_reason = ? where id = ?');
	const resolve = db.prepare(
		'update matches set flag_resolved_by = ?, flag_resolved_at = ? where id = ?'
	);
	shuffle(autumn.ms.filter((m) => m.reported))
		.slice(0, 7)
		.forEach((m, i) => {
			const who = m.by === m.a ? m.b : m.a;
			const reason = reasons[i % reasons.length];
			const t = at('2026-10-05', m.round) + 3600;
			flag.run(who, reason, m.id);
			log.run(autumn.sid, m.id, who, 'flag', null, JSON.stringify({ flagReason: reason }), t);
			if (i === 5) {
				const fixed = { ...m.reported!, games: '121', p1Games: 2, p2Games: 1 };
				report.run('121', 2, 1, fixed.p1Legend, fixed.p2Legend, fixed.diceWinnerId, m.by, t, m.id);
				resolve.run(ME, t + 7200, m.id);
				log.run(
					autumn.sid,
					m.id,
					ME,
					'edit',
					JSON.stringify(m.reported),
					JSON.stringify(fixed),
					t + 7200
				);
			}
			if (i === 6) {
				resolve.run(ME, t + 7200, m.id);
				log.run(autumn.sid, m.id, ME, 'resolve', null, JSON.stringify(m.reported), t + 7200);
			}
		});

	// A drop in group 2, and an erased player (dropped, then anonymised) in group 1; never a real id.
	const candidate = db.prepare(
		`select player_id as id from entries where season_id = ? and group_no = ? and player_id <> ?
		 and player_id in (select id from players where discord_id like 'dev-%')
		 and player_id not in (select flagged_by from matches where flagged_by is not null) limit 1`
	);
	const drop = db.prepare('update entries set dropped = 1 where season_id = ? and player_id = ?');
	const [dropped, erased] = [2, 1].map(
		(g) => (candidate.get(autumn.sid, g, ME) as { id: string }).id
	);
	for (const [i, id] of [dropped, erased].entries()) {
		drop.run(autumn.sid, id);
		log.run(
			autumn.sid,
			null,
			ME,
			'drop',
			null,
			JSON.stringify({ dropped: id }),
			at('2026-10-05', 5 + i)
		);
	}
	db.prepare(
		`update players set display_name = 'Former player ' || substr(id, -4), discord_id = null, avatar = null,
		 erased_at = unixepoch() where id = ?`
	).run(erased);
	for (const s of [summer.sid, autumn.sid])
		if (db.prepare('select 1 from entries where season_id = ? and player_id = ?').get(s, erased))
			log.run(s, null, ME, 'erase', null, JSON.stringify({ erased }), at('2026-10-05', 7));

	db.prepare(
		`insert into seasons (slug, name, status, start_date, rounds_per_week, deadline, top_cut_size)
		 values ('winter-2027', 'Winter 2027', 'draft', '2027-01-11', 2, '2027-02-21', 4)`
	).run();
})();

console.log(`Backed up to ${backup}. Reseeded:`);
console.table(
	db
		.prepare(
			`select s.slug, s.status, count(m.id) matches, sum(m.reported_by is not null) reported,
			 sum(m.games is not null) per_game, sum(m.flagged_by is not null) flagged
			 from seasons s left join matches m on m.season_id = s.id group by s.id`
		)
		.all()
);
