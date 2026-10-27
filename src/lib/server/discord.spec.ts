import { describe, expect, it, vi } from 'vitest';

// The shared setup turns role sync off; these tests reload the module with it on.
async function load(env: Record<string, string>) {
	vi.resetModules();
	vi.doMock('$app/env/private', () => ({
		GUILD_ID: 'g',
		DISCORD_BOT_TOKEN: '',
		PLAYER_ROLE_ID: '',
		...env
	}));
	const fetch = vi.fn(async () => new Response(null, { status: 204 }));
	vi.stubGlobal('fetch', fetch);
	return { discord: await import('#lib/server/discord.ts'), fetch };
}
const ON = { DISCORD_BOT_TOKEN: 'tok', PLAYER_ROLE_ID: 'r' };
const base = 'https://discord.com/api/v10/guilds/g/members';
const sent = (fetch: ReturnType<typeof vi.fn>) =>
	(fetch.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => [
		init.method,
		url.slice(base.length)
	]);
// Retries wait at least a second: run them on fake time.
async function settle(p: Promise<void>) {
	vi.useFakeTimers({ toFake: ['setTimeout'] });
	await vi.runAllTimersAsync();
	await p;
	vi.useRealTimers();
}
const rateLimited = () => new Response('{}', { status: 429, headers: { 'retry-after': '0' } });

describe('setPlayerRoles', () => {
	it('does nothing while role sync is off', async () => {
		const { discord, fetch } = await load({ DISCORD_BOT_TOKEN: 'tok' });
		await discord.setPlayerRoles([['u1', true]]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('adds and removes the role per member with the bot token', async () => {
		const { discord, fetch } = await load(ON);
		await discord.setPlayerRoles([
			['u1', true],
			['u2', false]
		]);
		expect(sent(fetch)).toEqual([
			['PUT', '/u1/roles/r'],
			['DELETE', '/u2/roles/r']
		]);
		const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect((init.headers as Record<string, string>).authorization).toBe('Bot tok');
	});

	it('sends calls in order, even when an earlier one waits out a rate limit', async () => {
		const { discord, fetch } = await load(ON);
		fetch.mockResolvedValueOnce(rateLimited());
		void discord.setPlayerRoles([['u1', false]]);
		await settle(discord.setPlayerRoles([['u1', true]]));
		expect(sent(fetch)).toEqual([
			['DELETE', '/u1/roles/r'],
			['DELETE', '/u1/roles/r'],
			['PUT', '/u1/roles/r']
		]);
	});

	it('retries rate limits, server errors and network errors, then gives up and logs', async () => {
		const { discord, fetch } = await load(ON);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		fetch
			.mockResolvedValueOnce(rateLimited())
			.mockResolvedValueOnce(new Response('', { status: 502 }))
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(new Response('', { status: 503 }));
		await settle(discord.setPlayerRoles([['u1', true]]));
		await settle(discord.setPlayerRoles([['u2', true]]));
		expect(sent(fetch).map(([, url]) => url)).toEqual([
			'/u1/roles/r',
			'/u1/roles/r',
			'/u1/roles/r',
			'/u2/roles/r',
			'/u2/roles/r'
		]);
		expect(log).toHaveBeenCalledOnce();
		log.mockRestore();
	});

	// Regression: dev SSR wraps fetch while rendering and warned (ssr_fetch_eager) on queued calls.
	it('uses the fetch from when the change was queued', async () => {
		const { discord, fetch } = await load(ON);
		const queued = discord.setPlayerRoles([['u1', true]]);
		const wrapped = vi.fn();
		vi.stubGlobal('fetch', wrapped);
		await queued;
		expect(fetch).toHaveBeenCalledOnce();
		expect(wrapped).not.toHaveBeenCalled();
	});

	it('gives every call a timeout so a hung request cannot stall the queue', async () => {
		const { discord, fetch } = await load(ON);
		await discord.setPlayerRoles([['u1', true]]);
		const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it('logs a final 4xx without retrying; a removal from someone gone from the server is fine', async () => {
		const { discord, fetch } = await load(ON);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		fetch
			.mockResolvedValueOnce(new Response('Missing Permissions', { status: 403 }))
			.mockResolvedValueOnce(new Response('Unknown Member', { status: 404 }));
		await discord.setPlayerRoles([
			['u1', false],
			['u2', false],
			['u3', false]
		]);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(log).toHaveBeenCalledOnce();
		log.mockRestore();
	});
});
