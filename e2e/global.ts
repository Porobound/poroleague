// Starts the webhook listener: the app's WEBHOOK_*_URLs point here, and every post is kept in
// memory. GET / returns them all. The returned function is the global teardown.
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { DB } from '../playwright.config.ts';
import { HOOKS_PORT, type Post } from './fixtures.ts';

export default async function () {
	const posts: Post[] = [];
	const server = createServer(async (req, res) => {
		if (req.method !== 'POST')
			return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(posts));
		let body = '';
		for await (const chunk of req) body += chunk;
		posts.push({ channel: req.url!.slice(1) as Post['channel'], body: JSON.parse(body) });
		res.writeHead(204).end();
	});
	await new Promise<void>((resolve) => server.listen(HOOKS_PORT, resolve));

	return () => {
		server.close();
		for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(DB + suffix, { force: true });
	};
}
