import { auditLabel, auditLines } from '#lib/server/auditLog.ts';
import { publicSeason } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	const type = url.searchParams.get('type');
	const all = auditLines(season.id);
	return {
		season,
		type,
		lines: all.filter((l) => !type || l.action === type),
		actions: [...new Set(all.map((l) => l.action))].map((a) => ({ a, label: auditLabel(a) }))
	};
};
