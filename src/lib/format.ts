import { LEAGUE_TZ } from '#lib/league/time.ts';

export const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

export const date = (d: string | null) =>
	d
		? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
				day: 'numeric',
				month: 'short',
				year: 'numeric'
			})
		: '';

const whenFmt = new Intl.DateTimeFormat('en-GB', {
	timeZone: LEAGUE_TZ,
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
	timeZoneName: 'short'
});
export const when = (d: Date) => whenFmt.format(d);

// "Sun 8 Nov" for a league date.
export const day = (d: string) =>
	new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});

// EET or EEST, whichever applies in Helsinki on that date.
export const tzName = (d: string) =>
	new Intl.DateTimeFormat('en-GB', { timeZone: LEAGUE_TZ, timeZoneName: 'short' })
		.formatToParts(new Date(`${d}T12:00:00Z`))
		.find((p) => p.type === 'timeZoneName')?.value ?? '';
