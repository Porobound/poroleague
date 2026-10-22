import { WEBHOOK_ORGANIZERS_URL, WEBHOOK_RESULTS_URL } from '$app/env/private';
import type { Embed } from '#lib/discord.ts';

// Fire-and-forget: failures are logged and never undo or block the change that triggered them.
async function post(url: string, embed: Embed) {
	if (!url) return;
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// Names and flag reasons are user text: never let them ping @everyone, roles or users.
			body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } })
		});
		if (!res.ok) console.error(`Discord webhook failed: ${res.status}`);
	} catch (e) {
		console.error(e);
	}
}

export const postResult = (embed: Embed) => void post(WEBHOOK_RESULTS_URL, embed);
export const postToOrganizers = (embed: Embed) => void post(WEBHOOK_ORGANIZERS_URL, embed);
