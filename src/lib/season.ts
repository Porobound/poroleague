import { date } from '#lib/format.ts';
export type SeasonStatus = 'draft' | 'signup' | 'groups' | 'play' | 'topcut' | 'finished';
export type SeasonFields = {
	name: string;
	slug: string;
	startDate: string;
	roundsPerWeek: number;
	deadline: string;
	topCutSize: number;
};
export type SeasonField = keyof SeasonFields;
export type FieldErrors = Partial<Record<SeasonField, string>>;
export type ParseResult =
	| { ok: true; values: SeasonFields }
	| { ok: false; errors: FieldErrors; raw: Record<SeasonField, string> };

export const FIELDS: SeasonField[] = [
	'name',
	'slug',
	'startDate',
	'roundsPerWeek',
	'deadline',
	'topCutSize'
];
export const NEW_SEASON: SeasonFields = {
	name: '',
	slug: '',
	startDate: '',
	roundsPerWeek: 2,
	deadline: '',
	topCutSize: 4
};

export const STATUS_LABEL: Record<SeasonStatus, string> = {
	draft: 'Draft',
	signup: 'Signup open',
	groups: 'Drawing groups',
	play: 'In play',
	topcut: 'Top cut',
	finished: 'Finished'
};

const EDITABLE: Record<SeasonStatus, SeasonField[]> = {
	draft: FIELDS,
	signup: ['name', 'startDate', 'roundsPerWeek', 'deadline', 'topCutSize'],
	groups: ['name', 'startDate', 'roundsPerWeek', 'deadline', 'topCutSize'],
	play: ['name', 'deadline', 'topCutSize'],
	topcut: ['name'],
	finished: []
};

// The top cut's size can still change in the top cut, until the bracket is published.
// From the group lock on, the season has a schedule, standings and results.
export const hasSchedule = (status: SeasonStatus) =>
	status !== 'draft' && status !== 'signup' && status !== 'groups';

export const editableFields = (status: SeasonStatus, cutPublished = false) =>
	status === 'topcut' && !cutPublished
		? [...EDITABLE.topcut, 'topCutSize' as const]
		: EDITABLE[status];
export const groupName = (n: number) => `Group ${String.fromCharCode(64 + n)}`;

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function seasonFields(s: {
	name: string;
	slug: string;
	startDate: string | null;
	roundsPerWeek: number;
	deadline: string | null;
	topCutSize: number | null;
}): SeasonFields {
	return {
		name: s.name,
		slug: s.slug,
		startDate: s.startDate ?? '',
		roundsPerWeek: s.roundsPerWeek,
		deadline: s.deadline ?? '',
		topCutSize: s.topCutSize ?? NEW_SEASON.topCutSize
	};
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(s: string): boolean {
	if (!DATE.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function int(s: string, min: number, max: number): number | null {
	const n = Number(s);
	return s !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Locked fields always keep their current value, so a crafted form can't change them.
export function parseSeasonForm(
	form: FormData,
	current: SeasonFields,
	editable: SeasonField[]
): ParseResult {
	const raw = Object.fromEntries(
		FIELDS.map((k) => [
			k,
			editable.includes(k) ? String(form.get(k) ?? '').trim() : String(current[k])
		])
	) as Record<SeasonField, string>;
	if (editable.includes('slug') && !raw.slug) raw.slug = slugify(raw.name);

	const errors: FieldErrors = {};
	if (!raw.name || raw.name.length > 60)
		errors.name = 'Give the season a name (up to 60 characters).';
	if (!SLUG.test(raw.slug)) errors.slug = 'Use lowercase letters, numbers and dashes.';
	if (!isDate(raw.startDate)) errors.startDate = 'Pick a start date.';
	if (!isDate(raw.deadline)) errors.deadline = 'Pick a deadline.';
	else if (isDate(raw.startDate) && raw.deadline <= raw.startDate)
		errors.deadline = 'The deadline must be after the start date.';
	const roundsPerWeek = int(raw.roundsPerWeek, 1, 4);
	if (roundsPerWeek === null) errors.roundsPerWeek = 'Between 1 and 4.';
	const topCutSize = int(raw.topCutSize, 0, 16);
	if (topCutSize === null) errors.topCutSize = 'Between 0 and 16.';

	if (roundsPerWeek === null || topCutSize === null || Object.keys(errors).length)
		return { ok: false, errors, raw };
	return {
		ok: true,
		values: {
			name: raw.name,
			slug: raw.slug,
			startDate: raw.startDate,
			roundsPerWeek,
			deadline: raw.deadline,
			topCutSize
		}
	};
}

export type Phase = { label: string; detail: string; state: 'done' | 'current' | 'todo' };
export type PhaseContext = {
	week: number;
	weeks: number;
	rounds: [number, number] | null; // this week's first and last round
	groups: number[]; // group sizes
	closed: boolean; // past the season deadline
	cut?: string; // top cut detail, e.g. the round being played
};

const groupsLabel = (sizes: number[]) =>
	sizes.every((n) => n === sizes[0])
		? `${sizes.length} group${sizes.length > 1 ? 's' : ''} of ${sizes[0]}`
		: `${sizes.length} groups (${sizes.join(' + ')})`;

function roundsDetail(c: PhaseContext) {
	if (c.week < 1) return 'Not started';
	if (c.week > c.weeks || !c.rounds) return 'All rounds out';
	const [a, b] = c.rounds;
	return `Week ${c.week} of ${c.weeks} · ${a === b ? `round ${a}` : `rounds ${a}–${b}`}`;
}

// The season page's phase bar. Finished seasons have no current step.
export function seasonPhases(
	s: { status: SeasonStatus; deadline: string | null },
	c: PhaseContext
): Phase[] {
	const current = {
		draft: 0,
		signup: 1,
		groups: 2,
		play: c.closed ? 4 : 3,
		topcut: 5,
		finished: 6
	}[s.status];
	const after = (i: number) => current > i;
	const steps: [string, string][] = [
		['Draft', after(0) ? 'Done' : 'Being set up'],
		['Signup', after(1) ? 'Closed' : current === 1 ? 'Open' : 'Not open yet'],
		[
			'Groups',
			c.groups.length ? groupsLabel(c.groups) : current === 2 ? 'Drawing' : 'After signup'
		],
		['Weekly rounds', after(3) ? 'Done' : current === 3 ? roundsDetail(c) : ''],
		['Deadline', date(s.deadline)],
		['Top cut', c.cut ?? (current >= 5 ? 'None' : 'Coming later')]
	];
	return steps.map(([label, detail], i) => ({
		label,
		detail,
		state: i < current ? 'done' : i === current ? 'current' : 'todo'
	}));
}
