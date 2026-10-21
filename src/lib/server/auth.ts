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

// ponytail: in-memory, per process; entries die with the server. Move to the sessions table if we ever run more than one instance.
const checkedAt = new Map<string, number>();
const PAGE_RECHECK_MS = 60_000;

// Asks Discord for the current role and stores it on the session, so the header and later loads agree.
async function hasOrganizerRole({ locals, url }: Ctx): Promise<boolean> {
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
	if (isOrganizer !== locals.user.isOrganizer) {
		setOrganizer(locals.session.id, isOrganizer);
		locals.user.isOrganizer = isOrganizer;
	}
	checkedAt.set(locals.session.id, Date.now());
	return isOrganizer;
}

// Page loads re-check at most once a minute per session (Discord rate-limits this endpoint).
export async function organizerPage(ctx: Ctx) {
	const { locals, url } = ctx;
	if (!locals.user || !locals.session) redirect(303, loginUrl(url));
	const fresh = Date.now() - (checkedAt.get(locals.session.id) ?? 0) < PAGE_RECHECK_MS;
	if (!(fresh ? locals.user.isOrganizer : await hasOrganizerRole(ctx)))
		redirect(303, '/login/not-organizer');
	return locals.user;
}

// Actions always ask Discord, so a removed role stops working immediately (spec: Auth & roles).
export async function organizerAction(ctx: Ctx) {
	if (!(await hasOrganizerRole(ctx))) redirect(303, '/login/not-organizer');
	return ctx.locals.user!;
}
