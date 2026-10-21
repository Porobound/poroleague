import { redirect } from '@sveltejs/kit';
import { deleteSession, SESSION_COOKIE } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies, locals }) => {
	if (locals.session) deleteSession(locals.session.id);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/');
};
