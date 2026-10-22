import { LEGENDS } from '#lib/legends.ts';
import { isValidScore } from './score';

export type Report = {
	p1Games: number;
	p2Games: number;
	p1Legend: string;
	p2Legend: string;
	diceWinnerId: string;
};
export type ReportErrors = Partial<Record<'score' | 'p1Legend' | 'p2Legend' | 'dice', string>>;
export type ReportParse = { ok: true; values: Report } | { ok: false; errors: ReportErrors };

const LEGEND_SET = new Set<string>(LEGENDS);

export function parseReport(form: FormData, p1Id: string, p2Id: string): ReportParse {
	const get = (k: string) => String(form.get(k) ?? '').trim();
	const [g1, g2] = [get('p1Games'), get('p2Games')];
	const p1Games = Number(g1);
	const p2Games = Number(g2);
	const values: Report = {
		p1Games,
		p2Games,
		p1Legend: get('p1Legend'),
		p2Legend: get('p2Legend'),
		diceWinnerId: get('dice')
	};

	const errors: ReportErrors = {};
	if (!g1 || !g2 || !isValidScore(p1Games, p2Games))
		errors.score = 'That is not a finished Bo3. Check the numbers.';
	if (!LEGEND_SET.has(values.p1Legend)) errors.p1Legend = 'Pick a legend.';
	if (!LEGEND_SET.has(values.p2Legend)) errors.p2Legend = 'Pick a legend.';
	if (values.diceWinnerId !== p1Id && values.diceWinnerId !== p2Id)
		errors.dice = 'Pick who won the dice roll.';
	return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

export type MatchMode = 'report' | 'flag' | 'locked' | 'view';
export type ModeMatch = {
	p1Id: string;
	p2Id: string;
	reportedBy: string | null;
	flaggedBy: string | null;
};
export type ModeContext = {
	viewerId: string | null;
	inPlay: boolean;
	closed: boolean; // past the season deadline
	voided: boolean; // a player was dropped
};

// What the viewer may do with a match. A saved report is final: either player flags it to have an
// organizer fix it. Flagging stays open after the deadline so a last-minute report can still be
// disputed; a flag locks the result for good (only organizers change it).
export function matchMode(m: ModeMatch, c: ModeContext): MatchMode {
	const playing = c.viewerId === m.p1Id || c.viewerId === m.p2Id;
	if (!c.viewerId || !playing || !c.inPlay || c.voided) return 'view';
	if (!m.reportedBy) return c.closed ? 'view' : 'report';
	return m.flaggedBy ? 'locked' : 'flag';
}

type Named = { id: string; name: string };

export function resultLine(p1: Named, p2: Named, r: Report): string {
	const dice = r.diceWinnerId === p1.id ? p1.name : p2.name;
	return `${p1.name} ${r.p1Games}-${r.p2Games} ${p2.name} (${r.p1Legend} vs ${r.p2Legend}, ${dice} won the roll)`;
}
