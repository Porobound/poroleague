// Dev only: backs up the dev DB, wipes it (keeping your player and session) and seeds four seasons:
// Spring finished with a top cut (per-game results, a perfect group stage, a champion), Summer
// finished (counts-only results), Autumn in play (per-game results, flags, a drop, an erased player;
// your rounds 5+ left open, weeks 4–6 unpublished; holidays on four of your opponents: one approved
// to report early, one approved and already reported, one pending, one revoked), Winter draft. Then
// it awards achievements: a one-trick, a flex player and a lucky roller reach gold, a newcomer has
// none. Fake players equip random cosmetics from what they earned (some none, one with the longest
// title). Same run = same data. Posts nothing to Discord.
// DEV_DISCORD_IDS (comma-separated, in .env) gives the first fake players real Discord ids.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ACHIEVEMENTS, achievementById } from '#lib/league/achievements.ts';
import { drawBracket } from '#lib/league/bracket.ts';
import { LEGENDS } from '#lib/legends.ts';
import { roundRobin } from '#lib/league/roundRobin.ts';
import { scoreGames } from '#lib/league/score.ts';
import { standings } from '#lib/league/standings.ts';
import { addDays } from '#lib/league/time.ts';
import { backfillAchievements } from '#lib/server/achievements.ts';
import * as schema from '#lib/server/db/schema.ts';

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
// Autumn's last published round: weeks 1–3 out, weeks 4–6 (rounds 7–11) still to publish.
const AUTUMN_PUBLISHED = 6;
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
		update players set title_achievement = null, badge_achievement = null, frame_achievement = null;
		delete from player_achievements; delete from holidays; delete from audit; delete from matches; delete from entries; delete from seasons;
		delete from sqlite_sequence where name in ('holidays', 'audit', 'matches', 'seasons');
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
	// Achievement spread: a one-trick (gold legend track), a flex player (gold Variety), a lucky
	// roller (gold Dice), a newcomer with nothing, and Spring's perfect group stage.
	// They never drop, so their seasons all count.
	const [PERFECT, FLEX, ONE_TRICK, LUCKY] = ids;
	const NEWCOMER = ids[22];
	let flex = 0; // FLEX cycles through the pool
	const legend = (id: string) =>
		id === FLEX
			? pool[flex++ % pool.length]
			: id === ONE_TRICK || rand() < 0.75
				? main.get(id)!
				: pick(pool);
	const dice = (a: string, b: string) => ([a, b].includes(LUCKY) ? LUCKY : pick([a, b]));

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
		perfect?: string;
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
				...(o.perfect === m.a || o.perfect === m.b
					? {
							games: m.a === o.perfect ? '11' : '22',
							p1Games: m.a === o.perfect ? 2 : 0,
							p2Games: m.a === o.perfect ? 0 : 2
						}
					: play(m.a, m.b, o.perGame(m.round))),
				p1Legend: legend(m.a),
				p2Legend: legend(m.b),
				diceWinnerId: dice(m.a, m.b)
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

	// A 4-player top cut seeded by group points, played to a champion, with the site's audit rows.
	function cut(s: { sid: number; ms: M[] }, start: string) {
		const people = [...new Set(s.ms.flatMap((m) => [m.a, m.b]))];
		const results = s.ms
			.filter((m) => m.reported)
			.map((m) => ({
				p1: m.a,
				p2: m.b,
				p1Games: m.reported!.p1Games,
				p2Games: m.reported!.p2Games
			}));
		const top = standings(
			people.map((playerId) => ({ playerId, dropped: false, tiebreak: null })),
			results,
			true
		)
			.slice(0, 4)
			.map((r) => r.playerId);
		const slots = drawBracket([top]) as string[];
		const seat = db.prepare(
			'update entries set seed = ?, slot = ? where season_id = ? and player_id = ?'
		);
		slots.forEach((p, i) => seat.run(top.indexOf(p) + 1, i, s.sid, p));
		log.run(
			s.sid,
			null,
			ME,
			'topcut',
			null,
			JSON.stringify({ size: 4, date: null }),
			at(start, 17)
		);
		const add = db.prepare(
			"insert into matches (season_id, stage, round, slot, p1_id, p2_id) values (?, 'playoff', ?, ?, ?, ?) returning id"
		);
		const match = (round: number, slot: number, a: string, b: string) => {
			const id = (add.get(s.sid, round, slot, a, b) as { id: number }).id;
			const r = {
				...play(a, b, true),
				p1Legend: legend(a),
				p2Legend: legend(b),
				diceWinnerId: dice(a, b)
			};
			const t = at(start, 17 + round);
			report.run(r.games, r.p1Games, r.p2Games, r.p1Legend, r.p2Legend, r.diceWinnerId, a, t, id);
			log.run(s.sid, id, a, 'report', null, JSON.stringify(r), t);
			// A level result sends the higher seed through, like the site.
			if (r.p1Games !== r.p2Games) return r.p1Games > r.p2Games ? a : b;
			return top.indexOf(a) < top.indexOf(b) ? a : b;
		};
		const final = [match(1, 0, slots[0], slots[1]), match(1, 1, slots[2], slots[3])];
		const champion = match(2, 0, final[0], final[1]);
		log.run(s.sid, null, ME, 'champion', null, JSON.stringify({ champion }), at(start, 20));
	}

	// Created first, so season ids stay in date order.
	const spring = season({
		slug: 'spring-2026',
		name: 'Spring 2026',
		status: 'finished',
		start: '2026-03-02',
		deadline: '2026-05-03',
		published: 15,
		players: [ME, ...ids.slice(0, 15)],
		groups: 1,
		played: () => true,
		perGame: () => true,
		perfect: PERFECT
	});
	log.run(spring.sid, null, ME, 'finalize', null, null, at('2026-03-02', 16));
	cut(spring, '2026-03-02');

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
		published: AUTUMN_PUBLISHED,
		players: shuffle([ME, ...ids]),
		groups: 2,
		played: (round, a, b) =>
			a === NEWCOMER || b === NEWCOMER
				? false
				: a === ME || b === ME
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
		`select player_id as id from entries where season_id = ? and group_no = ? and player_id not in (?, ?, ?, ?, ?, ?)
		 and player_id in (select id from players where discord_id like 'dev-%')
		 and player_id not in (select flagged_by from matches where flagged_by is not null) limit 1`
	);
	const drop = db.prepare('update entries set dropped = 1 where season_id = ? and player_id = ?');
	const [dropped, erased] = [2, 1].map(
		(g) =>
			(
				candidate.get(autumn.sid, g, ME, NEWCOMER, PERFECT, FLEX, ONE_TRICK, LUCKY) as {
					id: string;
				}
			).id
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
	for (const s of [spring.sid, summer.sid, autumn.sid])
		if (db.prepare('select 1 from entries where season_id = ? and player_id = ?').get(s, erased))
			log.run(s, null, ME, 'erase', null, JSON.stringify({ erased }), at('2026-10-05', 7));

	// Holidays in Autumn, all on your opponents, so you test them from the other side (ask for your
	// own on your player page). Published to week 3; your matches in weeks 4–6 (rounds 7–11) are open.
	const addHoliday = db.prepare(
		`insert into holidays (season_id, player_id, from_date, to_date, status, decided_by, decided_at, created_at)
		 values (?, ?, ?, ?, ?, ?, ?, ?)`
	);
	const holidayLog = (who: string, from: string, to: string, status: string, t: number) =>
		log.run(
			autumn.sid,
			null,
			ME,
			'holiday',
			null,
			JSON.stringify({ holiday: who, from, to, status }),
			t
		);
	const asked = at('2026-10-05', 5); // during week 3
	const gone = new Set([dropped, erased, NEWCOMER]);
	// Your unpublished matches against someone still in, earliest first.
	const vsMe = autumn.ms.filter(
		(m) =>
			m.round > AUTUMN_PUBLISHED && (m.a === ME || m.b === ME) && !gone.has(m.a === ME ? m.b : m.a)
	);
	if (vsMe.length < 4)
		throw new Error('Autumn needs four of your unpublished matches; reseed again');
	// The holiday covers the match's week: Monday to Sunday.
	const weekOfRound = (m: M) => {
		const w = Math.ceil(m.round / 2);
		return [addDays('2026-10-05', 7 * (w - 1)), addDays('2026-10-05', 7 * w - 1)] as const;
	};
	const them = (m: M) => (m.a === ME ? m.b : m.a);
	// The latest three stay ahead of today, so their On holiday badges show; the revoke takes the earliest.
	const [revoked, unlocked, played, pending] = [vsMe[0], ...vsMe.slice(-3)];
	const decided = (m: M, status: 'approved' | 'revoked', t: number) => {
		const [from, to] = weekOfRound(m);
		addHoliday.run(autumn.sid, them(m), from, to, status, ME, t, asked);
		holidayLog(them(m), from, to, 'approved', t - 1800);
		if (status === 'revoked') holidayLog(them(m), from, to, 'revoked', t);
	};
	// D: revoked. The badge is gone, the match stays unlocked for both of you.
	decided(revoked, 'revoked', asked + 3600);
	// A: approved, match unlocked and unplayed: report it early.
	decided(unlocked, 'approved', asked + 7200);
	// B: approved, and they already reported the match against you: hidden from everyone else.
	decided(played, 'approved', asked + 10800);
	const r: Result = {
		...play(played.a, played.b, true),
		p1Legend: legend(played.a),
		p2Legend: legend(played.b),
		diceWinnerId: pick([played.a, played.b])
	};
	const t = asked + 86400;
	report.run(
		r.games,
		r.p1Games,
		r.p2Games,
		r.p1Legend,
		r.p2Legend,
		r.diceWinnerId,
		them(played),
		t,
		played.id
	);
	log.run(autumn.sid, played.id, them(played), 'report', null, JSON.stringify(r), t);
	// C: pending. Approve it in Admin → Season and the match opens for you.
	addHoliday.run(autumn.sid, them(pending), ...weekOfRound(pending), 'pending', null, null, asked);
	console.log('Holidays on your opponents (Autumn 2026):');
	console.table(
		[
			['A approved, report early', unlocked],
			['B approved, already reported', played],
			['C pending, approve it', pending],
			['D revoked, still open', revoked]
		].map(([scenario, m]) => {
			const x = m as M;
			return {
				scenario,
				opponent: NICKS[ids.indexOf(them(x))],
				round: x.round,
				match: `/seasons/autumn-2026/matches/${x.id}`
			};
		})
	);

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
console.table(db.prepare('select status, count(*) holidays from holidays group by status').all());
backfillAchievements(drizzle(db, { schema }));
const tier = new Map(ACHIEVEMENTS.map((a) => [a.id, a.tier ?? 'one-off']));
const got = db.prepare('select achievement_id id from player_achievements').all() as {
	id: string;
}[];
const byTier = ['bronze', 'silver', 'gold', 'one-off'].map((t) => [
	t,
	got.filter((g) => tier.get(g.id) === t).length
]);
console.log('Achievements by tier:', Object.fromEntries(byTier));
const none = db
	.prepare(
		'select count(*) n from players where id not in (select player_id from player_achievements)'
	)
	.get() as { n: number };
console.log('Players with none:', none.n);

// Cosmetics: most fake players equip something they earned, some nothing; the player with the most
// achievements also gets the longest title, for header wrapping at 390 px.
// Gold among the longest, so it also draws the biggest frame.
const LONGEST = ACHIEVEMENTS.reduce((a, b) =>
	b.title.length > a.title.length ||
	(b.title.length === a.title.length && b.tier === 'gold' && a.tier !== 'gold')
		? b
		: a
);
const earnedBy = db.prepare(
	'select achievement_id id from player_achievements where player_id = ?'
);
const setLook = db.prepare(
	'update players set title_achievement = ?, badge_achievement = ?, frame_achievement = ? where id = ?'
);
const fakes = db
	.prepare('select id from players where id <> ? and erased_at is null order by id')
	.all(ME) as { id: string }[];
for (const { id } of fakes) {
	const mine = (earnedBy.all(id) as { id: string }[]).map((r) => r.id);
	if (!mine.length || rand() < 0.25) continue;
	const maybe = (l: string[]) => (l.length && rand() < 0.8 ? pick(l) : null);
	setLook.run(
		maybe(mine),
		maybe(mine),
		maybe(mine.filter((x) => achievementById.get(x)?.tier)),
		id
	);
}
const top = db
	.prepare(
		'select player_id id from player_achievements where player_id <> ? group by player_id order by count(*) desc, player_id limit 1'
	)
	.get(ME) as { id: string };
db.prepare(
	'insert or ignore into player_achievements (player_id, achievement_id, unlocked_at) values (?, ?, unixepoch())'
).run(top.id, LONGEST.id);
setLook.run(LONGEST.id, LONGEST.id, LONGEST.id, top.id);
console.log(
	'Cosmetics:',
	db
		.prepare(
			`select count(title_achievement) titles, count(badge_achievement) badges, count(frame_achievement) frames,
			 sum(title_achievement is null and badge_achievement is null and frame_achievement is null) bare from players`
		)
		.get(),
	`· longest title "${LONGEST.title}"`
);
