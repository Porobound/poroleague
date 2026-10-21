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

export function safeReturnTo(path: string | null): string {
	return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')
		? path
		: '/';
}
