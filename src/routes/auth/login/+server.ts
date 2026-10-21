import { redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI } from '$app/env/private';
import { authorizeUrl, safeReturnTo } from '#lib/discord.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, cookies }) => {
	const state = randomBytes(16).toString('base64url');
	const opts = { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600 } as const;
	cookies.set('oauth_state', state, opts);
	cookies.set('return_to', safeReturnTo(url.searchParams.get('returnTo')), opts);
	redirect(
		302,
		authorizeUrl({ clientId: DISCORD_CLIENT_ID, redirectUri: DISCORD_REDIRECT_URI, state }),
		{
			external: true
		}
	);
};
