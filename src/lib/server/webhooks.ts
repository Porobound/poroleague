import {
	WEBHOOK_ORGANIZERS_URL,
	WEBHOOK_PAIRINGS_URL,
	WEBHOOK_RESULTS_URL
} from '$app/env/private';
import type { Embed, WebhookBody } from '#lib/discord.ts';

// Fire-and-forget: failures are logged and never undo or block the change that triggered them.
async function post(url: string, body: WebhookBody) {
	if (!url) return;
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) console.error(`Discord webhook failed: ${res.status} ${await res.text()}`);
	} catch (e) {
		console.error(e);
	}
}

// Names and flag reasons are user text: embeds never ping @everyone, roles or users.
const embed = (...embeds: Embed[]): WebhookBody => ({ embeds, allowed_mentions: { parse: [] } });

// Several results (a published week's early ones) go ten embeds to a message, Discord's limit,
// one message at a time, so a big week can't trip the webhook's rate limit.
export const postResult = (...es: Embed[]) =>
	void (async () => {
		for (let i = 0; i < es.length; i += 10)
			await post(WEBHOOK_RESULTS_URL, embed(...es.slice(i, i + 10)));
	})();
export const postToOrganizers = (e: Embed) => void post(WEBHOOK_ORGANIZERS_URL, embed(e));
export const pairingsEnabled = () => !!WEBHOOK_PAIRINGS_URL;
export const postPairings = (body: WebhookBody) => void post(WEBHOOK_PAIRINGS_URL, body);
