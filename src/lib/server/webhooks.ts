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
		if (!res.ok) console.error(`Discord webhook failed: ${res.status}`);
	} catch (e) {
		console.error(e);
	}
}

// Names and flag reasons are user text: embeds never ping @everyone, roles or users.
const embed = (e: Embed): WebhookBody => ({ embeds: [e], allowed_mentions: { parse: [] } });

export const postResult = (e: Embed) => void post(WEBHOOK_RESULTS_URL, embed(e));
export const postToOrganizers = (e: Embed) => void post(WEBHOOK_ORGANIZERS_URL, embed(e));
export const pairingsEnabled = () => !!WEBHOOK_PAIRINGS_URL;
// In order, one message per round.
export const postPairings = (bodies: WebhookBody[]) =>
	void (async () => {
		for (const b of bodies) await post(WEBHOOK_PAIRINGS_URL, b);
	})();
