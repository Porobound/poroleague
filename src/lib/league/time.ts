export const LEAGUE_TZ = 'Europe/Helsinki';

// en-CA formats dates as YYYY-MM-DD, so league dates compare as strings.
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: LEAGUE_TZ });

export const leagueDate = (now: Date) => fmt.format(now);

// The deadline is 23:59 league time on the deadline date: closed once that date is over in Helsinki.
export const reportingClosed = (deadline: string | null, now: Date) =>
	!!deadline && leagueDate(now) > deadline;
