import { redirect } from '@sveltejs/kit';
import { GUILD_ID, ORGANIZER_ROLE_ID } from '$app/env/private';
import { profileFromMember, safeReturnTo } from '#lib/discord.ts';
import { db } from '#lib/server/db/index.ts';
import { players } from '#lib/server/db/schema.ts';
import { exchangeCode, fetchMember } from '#lib/server/discord.ts';
import { newPlayerId } from '#lib/server/players.ts';
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

async function discordLogin(code: string) {
	const { accessToken, expiresIn } = await exchangeCode(code);
	return { accessToken, expiresIn, result: await fetchMember(accessToken) };
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = cookies.get('oauth_state');
	const returnTo = safeReturnTo(cookies.get('return_to') ?? null);
	cookies.delete('oauth_state', { path: '/' });
	cookies.delete('return_to', { path: '/' });

	const code = url.searchParams.get('code');
	if (!code || !state || url.searchParams.get('state') !== state) redirect(303, '/login/failed');

	const login = await discordLogin(code).catch((e) => {
		console.error(e);
		return null;
	});
	if (!login || login.result.status === 'unauthorized') redirect(303, '/login/failed');
	if (login.result.status === 'not-member') redirect(303, '/login/not-member');

	const { member } = login.result;
	const profile = profileFromMember(member, GUILD_ID);
	const { id } = db
		.insert(players)
		.values({ id: newPlayerId(), ...profile })
		.onConflictDoUpdate({
			target: players.discordId,
			set: { displayName: profile.displayName, avatar: profile.avatar }
		})
		.returning({ id: players.id })
		.get();

	const expiresAt = new Date(Date.now() + Math.min(login.expiresIn, SESSION_TTL_SECONDS) * 1000);
	const token = createSession(
		id,
		login.accessToken,
		member.roles.includes(ORGANIZER_ROLE_ID),
		expiresAt
	);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
	redirect(303, returnTo);
};
