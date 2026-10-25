import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

// scripts/backup.sh runs from the host's cron. sqlite3, rclone and curl are stubs that log their args.
let dir: string;

function stub(name: string, body = '') {
	const file = join(dir, 'bin', name);
	writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "${dir}/calls"\n${body}\n`);
	chmodSync(file, 0o755);
}

function run() {
	const res = spawnSync('/bin/sh', [join(dir, 'scripts/backup.sh')], {
		// Only bin/ on PATH, so a real rclone on this machine can never upload.
		env: { HOME: dir, PATH: join(dir, 'bin') }
	});
	let calls: string[] = [];
	try {
		calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n');
	} catch {}
	return { status: res.status, calls };
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'poroleague-backup-'));
	mkdirSync(join(dir, 'bin'));
	mkdirSync(join(dir, 'scripts'));
	copyFileSync('scripts/backup.sh', join(dir, 'scripts/backup.sh'));
	mkdirSync(join(dir, 'data'));
	writeFileSync(join(dir, 'data/poroleague.db'), 'db');
	for (const tool of ['dirname', 'mkdir', 'date', 'find', 'grep', 'cat'])
		symlinkSync(
			execFileSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim(),
			join(dir, 'bin', tool)
		);
	stub('sqlite3', 'printf db > "${2#.backup }"');
	stub('curl');
	writeFileSync(join(dir, '.poroleague-hc-url'), 'https://hc-ping.com/test\n');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('backs up, uploads to r2crypt with copy, then pings', () => {
	stub('rclone', '[ "$1" = listremotes ] && echo r2: && echo r2crypt:; true');
	const { status, calls } = run();
	expect(status).toBe(0);
	expect(calls[0]).toMatch(
		/^sqlite3 data\/poroleague\.db \.backup backups\/poroleague-\d{4}-\d\d-\d\d\.db$/
	);
	expect(calls.slice(1)).toEqual([
		'rclone listremotes',
		'rclone copy --max-age 3d backups r2crypt:',
		'curl -fsS -m 10 --retry 3 -o /dev/null https://hc-ping.com/test'
	]);
	const [backup] = calls[0].split('backups/').slice(-1);
	expect(statSync(join(dir, 'backups', backup)).mode & 0o777).toBe(0o600);
});

it('skips the upload without an r2crypt remote', () => {
	stub('rclone', '[ "$1" = listremotes ] && echo r2-dev-crypt:; true');
	const { status, calls } = run();
	expect(status).toBe(0);
	expect(calls).not.toContain('rclone copy --max-age 3d backups r2crypt:');
	expect(calls.at(-1)).toMatch(/^curl /);
});

it('works without rclone installed', () => {
	const { status, calls } = run();
	expect(status).toBe(0);
	expect(calls.at(-1)).toMatch(/^curl /);
});

it('does not ping when the upload fails', () => {
	stub('rclone', '[ "$1" = listremotes ] && echo r2crypt: && exit 0; exit 1');
	const { status, calls } = run();
	expect(status).not.toBe(0);
	expect(calls.at(-1)).toBe('rclone copy --max-age 3d backups r2crypt:');
});

it('does not ping without a ping URL', () => {
	rmSync(join(dir, '.poroleague-hc-url'));
	stub('rclone', '[ "$1" = listremotes ] && echo r2crypt:; true');
	const { status, calls } = run();
	expect(status).toBe(0);
	expect(calls.some((c) => c.startsWith('curl'))).toBe(false);
});

it('fails without touching anything when the database is missing', () => {
	rmSync(join(dir, 'data/poroleague.db'));
	stub('rclone', '[ "$1" = listremotes ] && echo r2crypt:; true');
	const { status, calls } = run();
	expect(status).not.toBe(0);
	expect(calls).toEqual([]);
});
