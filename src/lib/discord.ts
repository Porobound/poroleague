import type { Report } from '#lib/league/report.ts';
import { groupName } from '#lib/season.ts';

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
export type Profile = { discordId: string; displayName: string; avatar: string };

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
	return { discordId: u.id, displayName: m.nick ?? u.global_name ?? u.username, avatar };
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
	url?: string;
	description?: string;
	color: number;
	fields?: { name: string; value: string; inline?: boolean }[];
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

export function organizerEditEmbed(
	m: MatchPost,
	by: string,
	o: { resolves: boolean; kept: boolean }
): Embed {
	return {
		title: `${o.resolves ? 'Flag resolved' : 'Result changed'} by ${escapeMd(by)}`,
		...base(m),
		description: `${o.kept ? 'Kept as reported' : 'New result'}: ${score(m)} (${m.report.p1Legend} vs ${m.report.p2Legend})`,
		color: SIGNAL
	};
}

export const dropEmbed = (o: {
	player: string;
	by: string;
	where: string;
	url: string;
	cancelled?: boolean;
	erased?: boolean;
}): Embed => ({
	title: o.cancelled ? `Drop cancelled: ${escapeMd(o.player)}` : `${escapeMd(o.player)} dropped`,
	url: o.url,
	description: `By ${escapeMd(o.by)}. ${o.cancelled ? 'Their matches count again.' : o.erased ? 'Erased on request; all their matches are void.' : 'All their matches are void.'}`,
	color: SIGNAL,
	footer: { text: o.where },
	timestamp: new Date().toISOString()
});

export const seasonDeletedEmbed = (name: string, by: string): Embed => ({
	title: `Season deleted: ${escapeMd(name)}`,
	description: `By ${escapeMd(by)}. It's hidden from the site; the data is kept.`,
	color: SIGNAL,
	footer: { text: 'Poroleague admin' },
	timestamp: new Date().toISOString()
});

export type WebhookBody = {
	content?: string;
	embeds?: Embed[];
	allowed_mentions: { parse: [] };
};
export type Pairing = { group: number | null; p1Id: string; p2Id: string };
export type PairingRound = { round: number; name?: string; pairs: Pairing[] };

// One message per week, an embed per round. `name` gives each player's (escaped) text.
export function pairingsPost(
	title: string,
	url: string,
	rounds: PairingRound[],
	name: (playerId: string) => string,
	at = new Date()
): WebhookBody {
	const field = (pairs: Pairing[], group: number | null) => ({
		name: group ? groupName(group) : 'Matches',
		value: pairs
			.filter((p) => p.group === group)
			.map((p) => `${name(p.p1Id)} vs ${name(p.p2Id)}`)
			.join('\n'),
		inline: true
	});
	return {
		// <url> keeps Discord from adding a preview card for the link.
		content: `**${escapeMd(title)}**\n[Full schedule](<${url}>)`,
		embeds: rounds.map((r) => ({
			title: r.name ?? `Round ${r.round}`,
			color: ACCENT,
			fields: [...new Set(r.pairs.map((p) => p.group))].map((g) => field(r.pairs, g)),
			footer: { text: title },
			timestamp: at.toISOString()
		})),
		allowed_mentions: { parse: [] }
	};
}

export const walkoverEmbed = (where: string, winner: string, url: string): Embed => ({
	title: `${escapeMd(winner)} advances (walkover)`,
	url,
	color: ACCENT,
	footer: { text: where },
	timestamp: new Date().toISOString()
});

export const cutEraseEmbed = (o: {
	player: string;
	by: string;
	where: string;
	url: string;
}): Embed => ({
	title: `${escapeMd(o.player)} erased during the top cut`,
	url: o.url,
	description: `By ${escapeMd(o.by)}. Erased on request; give their open top-cut match a walkover.`,
	color: SIGNAL,
	footer: { text: o.where },
	timestamp: new Date().toISOString()
});

export const championEmbed = (season: string, champion: string, url: string): Embed => ({
	title: `${escapeMd(season)} champion: ${escapeMd(champion)}`,
	url,
	color: SIGNAL,
	footer: { text: 'Top cut' },
	timestamp: new Date().toISOString()
});
