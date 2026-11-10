// Dev only: a pending holiday request for a fake player (random if none given), covering the next
// unpublished week that hasn't ended, to test approve and reject from scratch. Same limits as the
// site; posts nothing to Discord.
import Database from 'better-sqlite3';
import { requestError, type HolidayStatus } from '#lib/league/holiday.ts';
import { addDays, leagueDate, roundsOfWeek, weekOf, weekOn } from '#lib/league/time.ts';

process.loadEnvFile();
const [slug, who] = process.argv.slice(2);
if (!slug) throw new Error('usage: npm run db:holiday-dev -- <season-slug> [player-id]');
const db = new Database(process.env.DATABASE_URL!);
const s = db
	.prepare(
		`select id, status, start_date as startDate, rounds_per_week as roundsPerWeek,
		 published_round as publishedRound, deadline from seasons where slug = ? and deleted_at is null`
	)
	.get(slug) as
	| {
			id: number;
			status: string;
			startDate: string | null;
			roundsPerWeek: number;
			publishedRound: number;
			deadline: string | null;
	  }
	| undefined;
if (!s) throw new Error(`No season with slug "${slug}"`);
if (s.status !== 'play' || !s.startDate)
	throw new Error(`"${slug}" isn't in play; holidays are only for the weeks of play.`);
const startDate = s.startDate;
const maxRound = (
	db
		.prepare(`select max(round) n from matches where season_id = ? and stage = 'group'`)
		.get(s.id) as { n: number }
).n;
const today = leagueDate(new Date());
// The first unpublished week that hasn't ended: a request can't start in the past.
const week = Math.max(weekOf(s.publishedRound, s.roundsPerWeek) + 1, weekOn(startDate, today));
if (!roundsOfWeek(week, s.roundsPerWeek, maxRound))
	throw new Error(`"${slug}" has no unpublished week left to go away in.`);
const start = addDays(startDate, (week - 1) * 7);
const end = addDays(startDate, week * 7 - 1);
const from = start > today ? start : today;
const to = s.deadline && s.deadline < end ? s.deadline : end;
const cal = { ...s, startDate, maxRound, today };
const own = (id: string) =>
	db
		.prepare(
			`select from_date as "from", to_date as "to", status from holidays where season_id = ? and player_id = ?`
		)
		.all(s.id, id) as { from: string; to: string; status: HolidayStatus }[];

let id = who;
if (id) {
	if (!db.prepare('select 1 from entries where season_id = ? and player_id = ?').get(s.id, id))
		throw new Error(`${id} isn't in "${slug}".`);
} else {
	const fakes = (
		db
			.prepare(
				`select player_id as id from entries where season_id = ? and dropped = 0 and player_id like 'dev%'`
			)
			.all(s.id) as { id: string }[]
	).map((r) => r.id);
	id = fakes
		.filter((f) => !requestError({ from, to }, cal, own(f)))
		.sort(() => Math.random() - 0.5)[0];
	if (!id) throw new Error(`No fake player in "${slug}" can ask for ${from} to ${to}.`);
}
const problem = requestError({ from, to }, cal, own(id));
if (problem) throw new Error(problem);
db.prepare(
	`insert into holidays (season_id, player_id, from_date, to_date) values (?, ?, ?, ?)`
).run(s.id, id, from, to);
console.log(
	`Pending holiday for ${id}: ${from} to ${to} (week ${week}). Approve or reject it in Admin → Season.`
);
