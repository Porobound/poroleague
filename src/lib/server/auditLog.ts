import { date, when } from '#lib/format.ts';
import type { Report } from '#lib/league/report.ts';
import { groupName } from '#lib/season.ts';
import { seasonAudit } from '#lib/server/matches.ts';
import { seasonEntries } from '#lib/server/seasons.ts';

type Change = Partial<Report> & {
	flagReason?: string;
	dropped?: string;
	undropped?: string;
	order?: string[];
	name?: string;
	startDate?: string | null;
	roundsPerWeek?: number;
	deadline?: string | null;
	topCutSize?: number | null;
	week?: number;
	rounds?: [number, number];
	erased?: string;
};
const LABEL: Record<string, string> = {
	report: 'Report',
	flag: 'Flag',
	edit: 'Edit',
	resolve: 'Resolve',
	drop: 'Drop',
	undrop: 'Drop cancelled',
	tiebreak: 'Tiebreak',
	finalize: 'Finalize',
	season: 'Season',
	publish: 'Publish',
	erase: 'Erase'
};
export const auditLabel = (action: string) => LABEL[action] ?? action;

// A season edit line names each changed setting: "Deadline 15 Nov 2026 → 22 Nov 2026".
const settings = (before: Change | null, after: Change | null) =>
	(
		[
			['name', 'Name', (v: unknown) => String(v)],
			['startDate', 'Start', (v: unknown) => date(v as string | null) || '—'],
			['roundsPerWeek', 'Rounds a week', (v: unknown) => String(v)],
			['deadline', 'Deadline', (v: unknown) => date(v as string | null) || '—'],
			['topCutSize', 'Top cut', (v: unknown) => String(v ?? '—')]
		] as const
	)
		.filter(([k]) => after && k in after)
		.map(([k, label, f]) => `${label} ${f(before?.[k])} → ${f(after?.[k])}`)
		.join(' · ');

// Newest first, one readable line per audit row.
export function auditLines(seasonId: number, limit?: number) {
	const names = new Map(seasonEntries(seasonId).map((e) => [e.playerId, e.displayName]));
	const name = (id: string | null | undefined) => (id && names.get(id)) || 'Unknown';
	return seasonAudit(seasonId)
		.slice(0, limit)
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
				actorFormer: r.actorFormer,
				action: r.action,
				label: auditLabel(r.action),
				what: [
					match,
					change,
					after?.flagReason ? `“${after.flagReason}”` : '',
					r.action === 'flag' && !after?.flagReason ? 'reason removed' : '',
					after?.erased ? `Erased a player · now ${name(after.erased)}` : '',
					after?.dropped ? `Dropped ${name(after.dropped)}; their matches are void` : '',
					after?.undropped
						? `Cancelled ${name(after.undropped)}'s drop; their matches count again`
						: '',
					after?.order ? `Order: ${after.order.map(name).join(', ')}` : '',
					r.action === 'season' ? settings(before, after) : '',
					r.action === 'finalize' ? 'Season finalized' : '',
					r.action === 'publish' && after?.rounds
						? `Week ${after.week} published · R${after.rounds[0]}${after.rounds[1] > after.rounds[0] ? `–${after.rounds[1]}` : ''}`
						: ''
				]
					.filter(Boolean)
					.join(' · ')
			};
		});
}
