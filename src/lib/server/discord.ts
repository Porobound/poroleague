import {
	DISCORD_BOT_TOKEN,
	DISCORD_CLIENT_ID,
	DISCORD_CLIENT_SECRET,
	DISCORD_REDIRECT_URI,
	GUILD_ID,
	PLAYER_ROLE_ID
} from '$app/env/private';
import type { GuildMember } from '#lib/discord.ts';

const API = 'https://discord.com/api/v10';

export type MemberResult =
	{ status: 'member'; member: GuildMember } | { status: 'not-member' } | { status: 'unauthorized' };

export async function exchangeCode(
	code: string
): Promise<{ accessToken: string; expiresIn: number }> {
	const res = await fetch(`${API}/oauth2/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: DISCORD_CLIENT_ID,
			client_secret: DISCORD_CLIENT_SECRET,
			grant_type: 'authorization_code',
			code,
			redirect_uri: DISCORD_REDIRECT_URI
		})
	});
	if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
	const body = (await res.json()) as { access_token: string; expires_in: number };
	return { accessToken: body.access_token, expiresIn: body.expires_in };
}

// One call answers both "is a member?" (404 = no) and "which roles?".
export async function fetchMember(accessToken: string): Promise<MemberResult> {
	const res = await fetch(`${API}/users/@me/guilds/${GUILD_ID}/member`, {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	if (res.status === 404) return { status: 'not-member' };
	if (res.status === 401) return { status: 'unauthorized' };
	if (!res.ok) throw new Error(`Discord member lookup failed: ${res.status}`);
	return { status: 'member', member: (await res.json()) as GuildMember };
}

// One call per member, in order, so a season's worth of removals stays under the rate limit.
// Fire-and-forget: failures are logged and never block the league change behind them.
export async function setPlayerRole(discordIds: string[], on: boolean) {
	if (!DISCORD_BOT_TOKEN || !PLAYER_ROLE_ID) return;
	for (const id of discordIds) {
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const res = await fetch(`${API}/guilds/${GUILD_ID}/members/${id}/roles/${PLAYER_ROLE_ID}`, {
					method: on ? 'PUT' : 'DELETE',
					headers: { authorization: `Bot ${DISCORD_BOT_TOKEN}` }
				});
				if (res.status === 429) {
					const { retry_after } = (await res.json()) as { retry_after: number };
					await new Promise((r) => setTimeout(r, retry_after * 1000));
					continue;
				}
				if (!res.ok) console.error(`Discord role sync failed: ${res.status} ${await res.text()}`);
			} catch (e) {
				console.error(e);
			}
			break;
		}
	}
}
