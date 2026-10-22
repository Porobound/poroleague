export const LEAGUE_TZ = 'Europe/Helsinki';

// en-CA formats dates as YYYY-MM-DD, so league dates compare as strings.
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: LEAGUE_TZ });

export const leagueDate = (now: Date) => fmt.format(now);

// The deadline is 23:59 league time on the deadline date: closed once that date is over in Helsinki.
export const reportingClosed = (deadline: string | null, now: Date) =>
	!!deadline && leagueDate(now) > deadline;

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
	(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;

export const weekOf = (round: number, roundsPerWeek: number) => Math.ceil(round / roundsPerWeek);

// A week's first and last round; null before week 1 or once the rounds run out.
export function roundsOfWeek(week: number, roundsPerWeek: number, maxRound: number) {
	const first = (week - 1) * roundsPerWeek + 1;
	return week >= 1 && first <= maxRound
		? ([first, Math.min(week * roundsPerWeek, maxRound)] as [number, number])
		: null;
}

// Week 1 starts on the start date (league time); 0 before the season starts.
export const currentWeek = (startDate: string | null, now: Date) =>
	startDate ? Math.max(0, Math.floor(daysBetween(startDate, leagueDate(now)) / 7) + 1) : 0;

export const addDays = (d: string, n: number) =>
	new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
