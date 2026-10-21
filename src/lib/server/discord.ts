import {
	DISCORD_CLIENT_ID,
	DISCORD_CLIENT_SECRET,
	DISCORD_REDIRECT_URI,
	GUILD_ID
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
