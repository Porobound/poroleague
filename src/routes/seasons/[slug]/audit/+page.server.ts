import { auditLabel, auditLines } from '#lib/server/auditLog.ts';
import { currentRole } from '#lib/server/auth.ts';
import { publicSeason } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { params, locals, url } = event;
	const season = publicSeason(params.slug, locals.user);
	// Organizers also see early reports; re-checked with Discord, as the session flag can be stale.
	const organizer = !!locals.user?.isOrganizer && (await currentRole(event));
	const type = url.searchParams.get('type');
	const all = auditLines(season.id, { publishedRound: season.publishedRound, organizer });
	return {
		season,
		type,
		lines: all.filter((l) => !type || l.action === type),
		actions: [...new Set(all.map((l) => l.action))].map((a) => ({ a, label: auditLabel(a) }))
	};
};
