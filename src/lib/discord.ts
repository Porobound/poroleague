import type { Report } from '#lib/league/report.ts';

export type DiscordUser = {
	id: string;
	username: string;
	global_name: string | null;
	avatar: string | null;
};
export type GuildMember = {
	user: DiscordUser;
	nick: string | null;
	avatar: string | null;
	roles: string[];
};
export type Profile = { id: string; displayName: string; avatar: string };

const CDN = 'https://cdn.discordapp.com';

// prompt=consent always shows Discord's screen, whose "Not you?" link is how players switch accounts.
export function authorizeUrl(o: { clientId: string; redirectUri: string; state: string }): string {
	const params = new URLSearchParams({
		client_id: o.clientId,
		response_type: 'code',
		redirect_uri: o.redirectUri,
		scope: 'identify guilds.members.read',
		state: o.state,
		prompt: 'consent'
	});
	return `https://discord.com/oauth2/authorize?${params}`;
}

export function profileFromMember(m: GuildMember, guildId: string): Profile {
	const u = m.user;
	const avatar = m.avatar
		? `${CDN}/guilds/${guildId}/users/${u.id}/avatars/${m.avatar}.png`
		: u.avatar
			? `${CDN}/avatars/${u.id}/${u.avatar}.png`
			: `${CDN}/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
	return { id: u.id, displayName: m.nick ?? u.global_name ?? u.username, avatar };
}

// Parse like a browser would (it strips tabs/newlines and treats \ as /), then require the same origin.
export function safeReturnTo(path: string | null): string {
	if (!path?.startsWith('/')) return '/';
	const url = new URL(path, 'http://same.invalid');
	return url.origin === 'http://same.invalid' ? url.pathname + url.search + url.hash : '/';
}

// Embeds render Discord markdown; names and flag reasons are user text and must show literally
// (no bold tricks, no disguised [links](…)). Legends come from our own list and stay as they are.
export const escapeMd = (s: string) => s.replace(/[\\*_~`|<>[\]()#-]/g, '\\$&');

export type Embed = {
	title: string;
	url: string;
	description: string;
	color: number;
	fields?: { name: string; value: string }[];
	footer: { text: string };
	timestamp: string;
};
type Named = { id: string; name: string };
export type MatchPost = {
	p1: Named;
	p2: Named;
	report: Report;
	where: string; // "Season · Group A · Round 3"
	url: string;
	at: Date;
};

const ACCENT = 0x4fd1b5;
const SIGNAL = 0xf2b33d;

const score = (m: MatchPost) =>
	`${escapeMd(m.p1.name)} ${m.report.p1Games}–${m.report.p2Games} ${escapeMd(m.p2.name)}`;
const base = (m: MatchPost) => ({
	url: m.url,
	footer: { text: m.where },
	timestamp: m.at.toISOString()
});

export function resultEmbed(m: MatchPost): Embed {
	const dice = m.report.diceWinnerId === m.p1.id ? m.p1.name : m.p2.name;
	return {
		title: score(m),
		...base(m),
		description: `${m.report.p1Legend} vs ${m.report.p2Legend} · 🎲 ${escapeMd(dice)} won the roll`,
		color: ACCENT
	};
}

export function flagEmbed(m: MatchPost, flagger: string, reason: string): Embed {
	return {
		title: `Result flagged by ${escapeMd(flagger)}`,
		...base(m),
		description: `${score(m)} (${m.report.p1Legend} vs ${m.report.p2Legend})`,
		color: SIGNAL,
		fields: [{ name: 'Reason', value: `> ${escapeMd(reason).replace(/\n/g, '\n> ')}` }]
	};
}
