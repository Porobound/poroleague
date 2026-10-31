import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, validateSession } from '#lib/server/session.ts';

const api = (path: string) => path === '/api/v1' || path.startsWith('/api/v1/');

export const handle: Handle = async ({ event, resolve }) => {
	// The public API is anonymous: no session, same answer for everyone, so caches can share it.
	// Errors aren't cached, so a 404 or 500 clears as soon as the cause does.
	if (api(event.url.pathname)) {
		event.locals.user = null;
		event.locals.session = null;
		const res = await resolve(event);
		res.headers.set('Access-Control-Allow-Origin', '*');
		res.headers.set('Cache-Control', res.ok ? 'public, max-age=60' : 'no-store');
		return res;
	}
	const token = event.cookies.get(SESSION_COOKIE);
	const row = token ? validateSession(token) : null;
	if (token && !row) event.cookies.delete(SESSION_COOKIE, { path: '/' });

	event.locals.user = row
		? {
				id: row.player.id,
				displayName: row.player.displayName,
				avatar: row.player.avatar,
				isOrganizer: row.session.isOrganizer
			}
		: null;
	event.locals.session = row ? { id: row.session.id, accessToken: row.session.accessToken } : null;
	return resolve(event);
};
