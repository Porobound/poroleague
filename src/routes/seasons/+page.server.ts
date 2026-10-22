import { allSeasons, groupStandings, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

// ponytail: queries per season; fine for a handful of seasons a year.
export const load: PageServerLoad = () => ({
	seasons: allSeasons()
		.filter((s) => s.status !== 'draft')
		.map((s) => {
			const list = seasonEntries(s.id);
			const groups = s.status === 'finished' ? groupStandings(s, list) : [];
			return {
				...s,
				players: list.length,
				groups: new Set(list.map((e) => e.group).filter(Boolean)).size,
				// No winner while first place is an unresolved tie or nobody has played.
				winners: groups
					.map((g) => g.rows[0])
					.filter((r) => r && r.played > 0 && !r.unresolvedTie)
					.map((r) => r.name)
			};
		})
});
