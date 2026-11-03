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

// "12–26 Nov", "26 Oct–8 Nov", "2 Nov": a holiday's dates.
export function dateSpan(from: string, to: string) {
	const part = (d: string) =>
		new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		});
	if (from === to) return part(from);
	return from.slice(0, 7) === to.slice(0, 7)
		? `${Number(from.slice(8))}–${part(to)}`
		: `${part(from)}–${part(to)}`;
}

// EET or EEST, whichever applies in Helsinki on that date.
export const tzName = (d: string) =>
	new Intl.DateTimeFormat('en-GB', { timeZone: LEAGUE_TZ, timeZoneName: 'short' })
		.formatToParts(new Date(`${d}T12:00:00Z`))
		.find((p) => p.type === 'timeZoneName')?.value ?? '';

// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st.
export const ordinal = (n: number) => {
	const s = ['th', 'st', 'nd', 'rd'];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
