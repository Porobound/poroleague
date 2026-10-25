import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 0003 moves the Discord id off players.id. Build a DB at 0002 with Discord ids everywhere a
// player is referenced, then migrate it the way the container does.
const dir = mkdtempSync(join(tmpdir(), 'poroleague-ids-'));
const db = new Database(join(dir, 'test.db'));
const TABLES = ['players', 'sessions', 'seasons', 'entries', 'matches', 'audit'];
const rows = (t: string) =>
	db.prepare(`select * from ${t} order by rowid`).all() as Record<string, unknown>[];
const counts = () => TABLES.map((t) => rows(t).length);
let before: number[];
let id: (discordId: string) => string;

beforeAll(() => {
	const old = join(dir, 'drizzle-0002');
	cpSync('drizzle', old, { recursive: true });
	const journal = JSON.parse(readFileSync(join(old, 'meta/_journal.json'), 'utf8'));
	journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 2);
	writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
	migrate(drizzle(db), { migrationsFolder: old });

	db.exec(`
		insert into players (id, display_name, avatar) values ('111', 'Aki', 'https://cdn/a.png'), ('222', 'Mika', null);
		insert into sessions (id, player_id, access_token, is_organizer, expires_at) values ('h', '111', 'tok', 1, 9999999999);
		insert into seasons (id, slug, name, status, deleted_at, deleted_by) values (1, 's1', 'S1', 'play', null, null), (2, 's0~deleted-2', 'S0', 'draft', 1, '111');
		insert into entries (season_id, player_id) values (1, '111'), (1, '222');
		insert into matches (id, season_id, round, p1_id, p2_id, p1_games, p2_games, dice_winner_id, reported_by, flagged_by, flag_reason, flag_resolved_by)
			values (1, 1, 1, '111', '222', 2, 1, '222', '111', '222', 'wrong', '111'), (2, 1, 2, '222', '111', null, null, null, null, null, null, null);
		insert into audit (season_id, match_id, actor_id, action, before, after) values
			(1, 1, '111', 'report', null, '{"p1Games":2,"p2Games":1,"diceWinnerId":"222"}'),
			(1, 1, '111', 'edit', '{"p1Games":2,"p2Games":1,"diceWinnerId":"222"}', '{"p1Games":2,"p2Games":0,"diceWinnerId":"111"}'),
			(1, null, '111', 'drop', null, '{"dropped":"222"}'),
			(1, null, '111', 'undrop', null, '{"undropped":"222"}'),
			(1, null, '111', 'tiebreak', null, '{"order":["222","111"]}'),
			(1, null, '111', 'finalize', null, null);
	`);
	before = counts();
	migrate(drizzle(db), { migrationsFolder: 'drizzle' });
	const map = new Map(rows('players').map((p) => [p.discord_id as string, p.id as string]));
	id = (d) => map.get(d)!;
});

afterAll(() => {
	db.close();
	rmSync(dir, { recursive: true });
});

describe('0003 player ids', () => {
	it('keeps every row', () => {
		expect(counts()).toEqual(before);
	});

	it('moves Discord ids to discord_id and gives players random ids', () => {
		const ps = rows('players');
		expect(ps.map((p) => p.discord_id)).toEqual(['111', '222']);
		for (const p of ps) expect(p.id).toMatch(/^[0-9a-f]{16}$/);
		expect(id('111')).not.toBe(id('222'));
	});

	it('remaps every player column', () => {
		const [a, b] = [id('111'), id('222')];
		expect(rows('sessions')[0].player_id).toBe(a);
		expect(rows('entries').map((e) => e.player_id)).toEqual([a, b]);
		expect(rows('seasons').map((s) => s.deleted_by)).toEqual([null, a]);
		expect(rows('matches')[0]).toMatchObject({
			p1_id: a,
			p2_id: b,
			dice_winner_id: b,
			reported_by: a,
			flagged_by: b,
			flag_resolved_by: a
		});
		expect(rows('matches')[1]).toMatchObject({
			p1_id: b,
			p2_id: a,
			dice_winner_id: null,
			reported_by: null
		});
		expect(new Set(rows('audit').map((r) => r.actor_id))).toEqual(new Set([a]));
	});

	it('remaps ids inside audit JSON, keeping the tiebreak order', () => {
		const [a, b] = [id('111'), id('222')];
		const json = rows('audit').map((r) => [
			r.before && JSON.parse(r.before as string),
			r.after && JSON.parse(r.after as string)
		]);
		expect(json[0][1].diceWinnerId).toBe(b);
		expect([json[1][0].diceWinnerId, json[1][1].diceWinnerId]).toEqual([b, a]);
		expect(json[2][1]).toEqual({ dropped: b });
		expect(json[3][1]).toEqual({ undropped: b });
		expect(json[4][1]).toEqual({ order: [b, a] });
		expect(json[5][1]).toBeNull();
	});

	it('leaves the Discord ids only in players.discord_id', () => {
		const dump = TABLES.map((t) =>
			JSON.stringify(t === 'players' ? rows(t).map(({ discord_id: _, ...p }) => p) : rows(t))
		).join('\n');
		expect(dump).not.toMatch(/"(111|222)"/);
	});

	it('enforces foreign keys afterwards', () => {
		expect(db.pragma('foreign_key_check')).toEqual([]);
	});
});
