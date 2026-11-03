import { auditLabel, auditLines } from '#lib/server/auditLog.ts';
import { publicSeason } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	// Organizers also see early reports. Session role only: a Discord re-check can log out, and a
	// public page must never do that.
	const organizer = !!locals.user?.isOrganizer;
	const type = url.searchParams.get('type');
	const all = auditLines(season.id, { publishedRound: season.publishedRound, organizer });
	return {
		season,
		type,
		lines: all.filter((l) => !type || l.action === type),
		actions: [...new Set(all.map((l) => l.action))].map((a) => ({ a, label: auditLabel(a) }))
	};
};
