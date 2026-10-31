import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, validateSession } from '#lib/server/session.ts';

export const handle: Handle = ({ event, resolve }) => {
	// The public API is anonymous: no session, same answer for everyone, so caches can share it.
	if (event.url.pathname.startsWith('/api/v1/')) {
		event.locals.user = null;
		event.locals.session = null;
		return Promise.resolve(resolve(event)).then((res) => {
			res.headers.set('Access-Control-Allow-Origin', '*');
			res.headers.set('Cache-Control', 'public, max-age=60');
			return res;
		});
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
