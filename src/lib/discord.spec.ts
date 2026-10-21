import { describe, expect, it } from 'vitest';
import { authorizeUrl, profileFromMember, safeReturnTo, type GuildMember } from './discord';

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
			id: '80351110224678912',
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
