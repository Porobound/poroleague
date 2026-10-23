import { rmSync } from 'node:fs';
import { DB } from '../playwright.config.ts';

export default () => {
	for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(DB + suffix, { force: true });
};
