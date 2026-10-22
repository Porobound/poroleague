import { when } from '#lib/format.ts';
import type { Report } from '#lib/league/report.ts';
import { groupName } from '#lib/season.ts';
import { seasonAudit } from '#lib/server/matches.ts';
import { publicSeason, seasonEntries } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

type Change = Partial<Report> & { flagReason?: string; dropped?: string; order?: string[] };
const LABEL: Record<string, string> = {
	report: 'Report',
	flag: 'Flag',
	edit: 'Edit',
	resolve: 'Resolve',
	drop: 'Drop',
	tiebreak: 'Tiebreak',
	finalize: 'Finalize'
};

export const load: PageServerLoad = ({ params, locals, url }) => {
	const season = publicSeason(params.slug, locals.user);
	const names = new Map(seasonEntries(season.id).map((e) => [e.playerId, e.displayName]));
	const name = (id: string | null | undefined) => (id && names.get(id)) || 'Unknown';
	const type = url.searchParams.get('type');
	const rows = seasonAudit(season.id);

	const lines = rows
		.filter((r) => !type || r.action === type)
		.map((r) => {
			const result = (c: Change | null) =>
				c?.p1Games != null
					? `${name(r.p1Id)} ${c.p1Games}–${c.p2Games} ${name(r.p2Id)} · ${c.p1Legend} vs ${c.p2Legend} · dice: ${name(c.diceWinnerId)}`
					: '';
			const [before, after] = [r.before as Change | null, r.after as Change | null];
			const change = [result(before), result(after)].filter(Boolean).join(' → ');
			const where = r.round ? `${r.group ? `${groupName(r.group)} ` : ''}R${r.round}` : '';
			// A result line already names both players; otherwise (flag, drop) say whose match it was.
			const match = where && !change ? `${where} · ${name(r.p1Id)} vs ${name(r.p2Id)}` : where;
			return {
				id: r.id,
				when: when(r.createdAt),
				actor: r.actor,
				action: r.action,
				label: LABEL[r.action] ?? r.action,
				what: [
					match,
					change,
					after?.flagReason ? `“${after.flagReason}”` : '',
					after?.dropped ? `Dropped ${name(after.dropped)}; their matches are void` : '',
					after?.order ? `Order: ${after.order.map(name).join(', ')}` : '',
					r.action === 'finalize' ? 'Season finalized' : ''
				]
					.filter(Boolean)
					.join(' · ')
			};
		});

	return {
		season,
		type,
		lines,
		actions: [...new Set(rows.map((r) => r.action))].map((a) => ({ a, label: LABEL[a] ?? a }))
	};
};
