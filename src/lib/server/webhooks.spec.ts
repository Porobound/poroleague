import { afterEach, describe, expect, it, vi } from 'vitest';

// The shared setup turns every webhook off; these tests reload the module with them on.
async function load(urls: Record<string, string>) {
	vi.resetModules();
	vi.doMock('$app/env/private', () => ({
		WEBHOOK_RESULTS_URL: '',
		WEBHOOK_ORGANIZERS_URL: '',
		WEBHOOK_PAIRINGS_URL: '',
		...urls
	}));
	const fetch = vi.fn(async () => new Response('', { status: 204 }));
	vi.stubGlobal('fetch', fetch);
	return { hooks: await import('#lib/server/webhooks.ts'), fetch };
}
const flush = () => new Promise((r) => setTimeout(r));
const embed = { title: '**@everyone**' } as never;

afterEach(() => vi.doUnmock('$app/env/private'));

describe('webhooks', () => {
	it('send nothing when the channel is off', async () => {
		const { hooks, fetch } = await load({});
		hooks.postResult(embed);
		hooks.postToOrganizers(embed);
		hooks.postPairings({ content: 'x' } as never);
		await flush();
		expect(fetch).not.toHaveBeenCalled();
		expect(hooks.pairingsEnabled()).toBe(false);
	});

	it('post embeds that can never ping anyone', async () => {
		const { hooks, fetch } = await load({ WEBHOOK_RESULTS_URL: 'https://hook/results' });
		hooks.postResult(embed);
		await flush();
		expect(fetch).toHaveBeenCalledOnce();
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://hook/results');
		expect(JSON.parse(init.body as string)).toEqual({
			embeds: [embed],
			allowed_mentions: { parse: [] }
		});
	});

	it('log failures instead of throwing', async () => {
		const { hooks, fetch } = await load({
			WEBHOOK_ORGANIZERS_URL: 'https://hook/org',
			WEBHOOK_PAIRINGS_URL: 'https://hook/pairings'
		});
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		fetch.mockResolvedValueOnce(new Response('nope', { status: 500 }));
		fetch.mockRejectedValueOnce(new Error('offline'));
		expect(hooks.pairingsEnabled()).toBe(true);
		expect(() => hooks.postToOrganizers(embed)).not.toThrow();
		expect(() => hooks.postPairings({ content: 'x' } as never)).not.toThrow();
		await flush();
		expect(log).toHaveBeenCalledWith('Discord webhook failed: 500 nope');
		expect(log).toHaveBeenCalledWith(new Error('offline'));
	});
});
