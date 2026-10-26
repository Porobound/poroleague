import { date, when } from '#lib/format.ts';
import { matchName } from '#lib/league/bracket.ts';
import type { Report } from '#lib/league/report.ts';
import { groupName } from '#lib/season.ts';
import { seasonAudit } from '#lib/server/matches.ts';
import { seasonEntries } from '#lib/server/seasons.ts';
import { cutRounds } from '#lib/server/topCut.ts';

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
	size?: number;
	date?: string | null;
	winner?: string;
	champion?: string;
	cleared?: [string, string];
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
	erase: 'Erase',
	topcut: 'Top cut',
	walkover: 'Walkover',
	champion: 'Champion',
	reset: 'Reset'
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
	const rounds = cutRounds(seasonId);
	// A top-cut edit can repoint a later match to new players (see syncBracket). Its reset row keeps
	// the players it cleared, so the lines older than it still name who played then.
	const heldBy = new Map<number, [string, string]>();
	return seasonAudit(seasonId)
		.slice(0, limit)
		.map((r) => {
			const cleared = r.action === 'reset' ? (r.after as Change | null)?.cleared : undefined;
			const [p1Id, p2Id] = cleared ??
				(r.matchId === null ? undefined : heldBy.get(r.matchId)) ?? [r.p1Id, r.p2Id];
			if (cleared && r.matchId !== null) heldBy.set(r.matchId, cleared);
			const winner = (g: string) => (g === 'D' ? 'draw' : name(g === '1' ? p1Id : p2Id));
			const games = (c: Change) =>
				c.games ? ` · games ${[...c.games].map(winner).join(', ')}` : '';
			const result = (c: Change | null) =>
				c?.p1Games != null
					? `${name(p1Id)} ${c.p1Games}–${c.p2Games} ${name(p2Id)}${games(c)} · ${c.p1Legend} vs ${c.p2Legend} · dice: ${name(c.diceWinnerId)}`
					: '';
			const [before, after] = [r.before as Change | null, r.after as Change | null];
			const change = [result(before), result(after)].filter(Boolean).join(' → ');
			const where = !r.round
				? ''
				: r.stage === 'playoff'
					? matchName(r.round, r.slot ?? 0, rounds)
					: `${r.group ? `${groupName(r.group)} ` : ''}R${r.round}`;
			// A result line already names both players; otherwise (flag, drop) say whose match it was.
			const match = where && !change ? `${where} · ${name(p1Id)} vs ${name(p2Id)}` : where;
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
					cleared ? 'Result cleared: an earlier top-cut result changed' : '',
					r.action === 'topcut'
						? `Top cut published · ${after?.size} players${after?.date ? ` · ${date(after.date)}` : ''}`
						: '',
					after?.winner ? `${name(after.winner)} advances` : '',
					after?.champion ? `Champion: ${name(after.champion)}` : '',
					r.action === 'publish' && after?.rounds
						? `Week ${after.week} published · R${after.rounds[0]}${after.rounds[1] > after.rounds[0] ? `–${after.rounds[1]}` : ''}`
						: ''
				]
					.filter(Boolean)
					.join(' · ')
			};
		});
}
