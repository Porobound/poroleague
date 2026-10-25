import { describe, expect, it } from 'vitest';
import {
	authorizeUrl,
	dropEmbed,
	escapeMd,
	flagEmbed,
	organizerEditEmbed,
	pairingsPost,
	profileFromMember,
	resultEmbed,
	safeReturnTo,
	seasonDeletedEmbed,
	type GuildMember
} from './discord';

const member = (over: Partial<GuildMember> = {}, user: Partial<GuildMember['user']> = {}) => ({
	nick: null,
	avatar: null,
	roles: [],
	...over,
	user: { id: '80351110224678912', username: 'mikhe', global_name: null, avatar: null, ...user }
});

describe('authorizeUrl', () => {
	it('builds the Discord authorize URL with scopes and state', () => {
		const url = new URL(
			authorizeUrl({
				clientId: 'cid',
				redirectUri: 'http://localhost:5173/auth/callback',
				state: 's1'
			})
		);
		expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: 'cid',
			response_type: 'code',
			redirect_uri: 'http://localhost:5173/auth/callback',
			scope: 'identify guilds.members.read',
			state: 's1',
			prompt: 'consent'
		});
	});
});

describe('profileFromMember', () => {
	it('prefers server nickname, then global name, then username', () => {
		expect(
			profileFromMember(member({ nick: 'Nick' }, { global_name: 'Global' }), 'g').displayName
		).toBe('Nick');
		expect(profileFromMember(member({}, { global_name: 'Global' }), 'g').displayName).toBe(
			'Global'
		);
		expect(profileFromMember(member(), 'g').displayName).toBe('mikhe');
	});

	it('prefers server avatar over user avatar', () => {
		expect(profileFromMember(member({ avatar: 'srv' }, { avatar: 'usr' }), 'g1').avatar).toBe(
			'https://cdn.discordapp.com/guilds/g1/users/80351110224678912/avatars/srv.png'
		);
		expect(profileFromMember(member({}, { avatar: 'usr' }), 'g1').avatar).toBe(
			'https://cdn.discordapp.com/avatars/80351110224678912/usr.png'
		);
	});

	it('falls back to the default avatar derived from the user id', () => {
		expect(profileFromMember(member(), 'g1')).toEqual({
			discordId: '80351110224678912',
			displayName: 'mikhe',
			avatar: 'https://cdn.discordapp.com/embed/avatars/5.png'
		});
	});
});

describe('safeReturnTo', () => {
	it('keeps same-site paths, rejects everything else', () => {
		expect(safeReturnTo('/seasons/s1?x=1')).toBe('/seasons/s1?x=1');
		for (const bad of [
			null,
			'',
			'https://evil.com',
			'//evil.com',
			'/\\evil.com',
			'/\t/evil.com',
			'/\n/evil.com'
		]) {
			expect(safeReturnTo(bad)).toBe('/');
		}
	});
});

describe('match embeds', () => {
	const m = {
		p1: { id: 'a', name: 'Alice' },
		p2: { id: 'b', name: 'B*o*b' },
		report: { p1Games: 2, p2Games: 1, p1Legend: 'Jinx', p2Legend: 'Ahri', diceWinnerId: 'b' },
		where: 'Season 1 · Group A · Round 3',
		url: 'https://league.test/seasons/s1/matches/7',
		at: new Date('2026-10-22T12:00:00Z')
	};

	it('escapes Discord markdown in user text', () => {
		expect(escapeMd('[x](http://evil) *b* <@1>')).toBe('\\[x\\]\\(http://evil\\) \\*b\\* \\<@1\\>');
	});

	it('posts a result with score, legends and dice winner', () => {
		expect(resultEmbed(m)).toEqual({
			title: 'Alice 2–1 B\\*o\\*b',
			url: m.url,
			description: 'Jinx vs Ahri · 🎲 B\\*o\\*b won the roll',
			color: 0x4fd1b5,
			footer: { text: m.where },
			timestamp: '2026-10-22T12:00:00.000Z'
		});
	});

	it('posts a flag with the reason quoted line by line', () => {
		const e = flagEmbed(m, 'Alice', 'It was 1-2\nnot 2-1');
		expect(e.title).toBe('Result flagged by Alice');
		expect(e.color).toBe(0xf2b33d);
		expect(e.description).toBe('Alice 2–1 B\\*o\\*b (Jinx vs Ahri)');
		expect(e.fields).toEqual([{ name: 'Reason', value: '> It was 1\\-2\n> not 2\\-1' }]);
	});
});

describe('organizer posts', () => {
	const post = {
		p1: { id: '1', name: 'A*' },
		p2: { id: '2', name: 'B' },
		report: { p1Games: 2, p2Games: 1, p1Legend: 'Jinx', p2Legend: 'Ahri', diceWinnerId: '1' },
		where: 'S · Group A · Round 1',
		url: 'http://x/m/1',
		at: new Date('2026-10-22T10:00:00Z')
	};
	it('says whether a flag was resolved and whether the result changed', () => {
		const kept = organizerEditEmbed(post, 'Org_1', { resolves: true, kept: true });
		expect(kept.title).toBe('Flag resolved by Org\\_1');
		expect(kept.description).toBe('Kept as reported: A\\* 2–1 B (Jinx vs Ahri)');
		expect(organizerEditEmbed(post, 'Org', { resolves: false, kept: false }).title).toBe(
			'Result changed by Org'
		);
	});
	it('escapes names in drop and deletion posts', () => {
		expect(dropEmbed({ player: '*x*', by: 'Org', where: 'S', url: 'http://x' }).title).toBe(
			'\\*x\\* dropped'
		);
		expect(seasonDeletedEmbed('S_1', 'Org').title).toBe('Season deleted: S\\_1');
		const undo = dropEmbed({
			player: '*x*',
			by: 'Org',
			where: 'S',
			url: 'http://x',
			cancelled: true
		});
		expect(undo.title).toBe('Drop cancelled: \\*x\\*');
		expect(undo.description).toBe('By Org. Their matches count again.');
	});
});

describe('pairingsPost', () => {
	const rounds = [
		{
			round: 5,
			pairs: [
				{ group: 1, p1Id: '1', p2Id: '2' },
				{ group: 2, p1Id: '3', p2Id: '4' }
			]
		},
		{ round: 6, pairs: [{ group: 1, p1Id: '1', p2Id: 'dev-2' }] }
	];
	const mention = (id: string) => (id === 'dev-2' ? 'Former player 1' : `<@d${id}>`);
	const body = pairingsPost('Autumn *26* · Week 3', 'http://x/schedule', rounds, mention);

	it('pings nobody', () => {
		expect(body.content).toBe('**Autumn \\*26\\* · Week 3**\n[Full schedule](<http://x/schedule>)');
		expect(body.allowed_mentions).toEqual({ parse: [] });
	});
	it('lays out one embed per round with a field per group', () => {
		expect(body.embeds!.map((e) => e.title)).toEqual(['Round 5', 'Round 6']);
		expect(body.embeds![0].fields).toEqual([
			{ name: 'Group A', value: '<@d1> vs <@d2>', inline: true },
			{ name: 'Group B', value: '<@d3> vs <@d4>', inline: true }
		]);
		expect(body.embeds![1].fields![0].value).toBe('<@d1> vs Former player 1');
		expect(body.embeds!.every((e) => !e.url)).toBe(true);
	});
});
