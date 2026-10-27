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
		await discord.setPlayerRoles([['u1', true]]);
		expect(sent(fetch)).toEqual([
			['DELETE', '/u1/roles/r'],
			['DELETE', '/u1/roles/r'],
			['PUT', '/u1/roles/r']
		]);
	});

	it('gives up after three rate limits and logs it', async () => {
		const { discord, fetch } = await load(ON);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		fetch.mockImplementation(async () => rateLimited());
		await discord.setPlayerRoles([['u1', true]]);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(log).toHaveBeenCalledOnce();
		log.mockRestore();
	});

	it('logs failures and carries on with the next member', async () => {
		const { discord, fetch } = await load(ON);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		fetch.mockResolvedValueOnce(new Response('Missing Permissions', { status: 403 }));
		fetch.mockRejectedValueOnce(new Error('offline'));
		await discord.setPlayerRoles([
			['u1', false],
			['u2', false],
			['u3', false]
		]);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(log).toHaveBeenCalledTimes(2);
		log.mockRestore();
	});
});
