import { redirect } from '@sveltejs/kit';
import { ORGANIZER_ROLE_ID } from '$app/env/private';
import { fetchMember } from '#lib/server/discord.ts';
import { deleteSession, setOrganizer } from '#lib/server/session.ts';

type Ctx = { locals: App.Locals; url: URL };

const loginUrl = (url: URL) => `/auth/login?returnTo=${encodeURIComponent(url.pathname)}`;

export function playerAction({ locals, url }: Ctx) {
	if (!locals.user) redirect(303, loginUrl(url));
	return locals.user;
}

// pony// ponytail: in-memory, per process; entries die with the server. Move to the sessions table if we ever run more than one instance.
const checkedAt = new Map<string, number>();
const ROLE_CHECK_MS = 60_000;

// Discord rate-limits the member endpoint hard (429 after a few calls), so the role is re-checked
// at most once a minute per session; if Discord refuses or fails, the last known role is kept.
async function currentRole({ locals, url }: Ctx): Promise<boolean> {
	if (!locals.user || !locals.session) redirect(303, loginUrl(url));
	const { user, session } = locals;
	if (Date.now() - (checkedAt.get(session.id) ?? 0) < ROLE_CHECK_MS) return user.isOrganizer;

	const result = await fetchMember(session.accessToken).catch((e) => {
		console.error(e);
		return null;
	});
	if (!result) return user.isOrganizer;
	if (result.status === 'unauthorized') {
		deleteSession(session.id);
		redirect(303, loginUrl(url));
	}
	const isOrganizer = result.status === 'member' && result.member.roles.includes(ORGANIZER_ROLE_ID);
	if (isOrganizer !== user.isOrganizer) {
		setOrganizer(session.id, isOrganizer);
		user.isOrganizer = isOrganizer;
	}
	checkedAt.set(session.id, Date.now());
	return isOrganizer;
}

export async function organizerPage(ctx: Ctx) {
	if (!(await currentRole(ctx))) redirect(303, '/login/not-organizer');
	return ctx.locals.user!;
}

// Same check as pages; kept as its own name so call sites say what they guard.
export const organizerAction = organizerPage;
