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

describe('setPlayerRole', () => {
	it('does nothing while role sync is off', async () => {
		const { discord, fetch } = await load({ DISCORD_BOT_TOKEN: 'tok' });
		await discord.setPlayerRole(['u1'], true);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('adds and removes the role per member with the bot token', async () => {
		const { discord, fetch } = await load(ON);
		await discord.setPlayerRole(['u1', 'u2'], true);
		await discord.setPlayerRole(['u3'], false);
		const calls = (fetch.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => [
			init.method,
			url,
			(init.headers as Record<string, string>).authorization
		]);
		const base = 'https://discord.com/api/v10/guilds/g/members';
		expect(calls).toEqual([
			['PUT', `${base}/u1/roles/r`, 'Bot tok'],
			['PUT', `${base}/u2/roles/r`, 'Bot tok'],
			['DELETE', `${base}/u3/roles/r`, 'Bot tok']
		]);
	});

	it('waits out a rate limit and retries', async () => {
		const { discord, fetch } = await load(ON);
		fetch.mockResolvedValueOnce(Response.json({ retry_after: 0 }, { status: 429 }));
		await discord.setPlayerRole(['u1'], true);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('logs failures and carries on with the next member', async () => {
		const { discord, fetch } = await load(ON);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		fetch.mockResolvedValueOnce(new Response('Missing Permissions', { status: 403 }));
		fetch.mockRejectedValueOnce(new Error('offline'));
		await discord.setPlayerRole(['u1', 'u2', 'u3'], false);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(log).toHaveBeenCalledTimes(2);
		log.mockRestore();
	});
});
