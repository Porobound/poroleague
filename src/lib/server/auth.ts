import { error, redirect } from '@sveltejs/kit';
import { ORGANIZER_ROLE_ID } from '$app/env/private';
import { fetchMember } from '#lib/server/discord.ts';
import { deleteSession, setOrganizer } from '#lib/server/session.ts';

type Ctx = { locals: App.Locals; url: URL };

const loginUrl = (url: URL) => `/auth/login?returnTo=${encodeURIComponent(url.pathname)}`;

export function playerAction({ locals, url }: Ctx) {
	if (!locals.user) redirect(303, loginUrl(url));
	return locals.user;
}

// Page loads trust the role stored at login.
export function organizerPage({ locals, url }: Ctx) {
	if (!locals.user) redirect(303, loginUrl(url));
	if (!locals.user.isOrganizer) redirect(303, '/login/not-organizer');
	return locals.user;
}

// Actions ask Discord again, so a removed role stops working immediately (spec: Auth & roles).
export async function organizerAction({ locals, url }: Ctx) {
	if (!locals.user || !locals.session) redirect(303, loginUrl(url));
	const result = await fetchMember(locals.session.accessToken).catch((e) => {
		console.error(e);
		error(503, "Discord didn't answer. Try again in a moment.");
	});
	if (result.status === 'unauthorized') {
		deleteSession(locals.session.id);
		redirect(303, loginUrl(url));
	}
	const isOrganizer = result.status === 'member' && result.member.roles.includes(ORGANIZER_ROLE_ID);
	if (isOrganizer !== locals.user.isOrganizer) setOrganizer(locals.session.id, isOrganizer);
	if (!isOrganizer) redirect(303, '/login/not-organizer');
	return locals.user;
}
