import { WEBHOOK_ORGANIZERS_URL, WEBHOOK_RESULTS_URL } from '$app/env/private';

// Fire-and-forget: failures are logged and never undo or block the change that triggered them.
async function post(url: string, content: string) {
	if (!url) return;
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// Names and flag reasons are user text: never let them ping @everyone, roles or users.
			body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
		});
		if (!res.ok) console.error(`Discord webhook failed: ${res.status}`);
	} catch (e) {
		console.error(e);
	}
}

export const postResult = (content: string) => void post(WEBHOOK_RESULTS_URL, content);
export const postToOrganizers = (content: string) => void post(WEBHOOK_ORGANIZERS_URL, content);
