import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

// scripts/migrate.ts runs at container start against the production DB.
it('migrates a fresh DB and is safe to rerun', () => {
	const dir = mkdtempSync(join(tmpdir(), 'poroleague-migrate-'));
	const file = join(dir, 'test.db');
	const run = () =>
		execFileSync('node', ['scripts/migrate.ts'], { env: { ...process.env, DATABASE_URL: file } });
	try {
		run();
		run();
		const db = new Database(file, { readonly: true });
		const tables = db
			.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
			.all()
			.map((t) => (t as { name: string }).name)
			.sort();
		db.close();
		expect(tables).toEqual([
			'__drizzle_migrations',
			'audit',
			'entries',
			'matches',
			'players',
			'seasons',
			'sessions'
		]);
	} finally {
		rmSync(dir, { recursive: true });
	}
});
