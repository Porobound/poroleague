import { createHash } from 'node:crypto';
import { isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORGANIZER_ROLE_ID } from '$app/env/private';
import { handle } from '../../hooks.server.ts';
import { GET as callback } from '../../routes/auth/callback/+server.ts';
import { currentRole, organizerPage } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { players, sessions } from '#lib/server/db/schema.ts';
import {
	createSession,
	SESSION_COOKIE,
	SESSION_TTL_SECONDS,
	validateSession
} from '#lib/server/session.ts';
import { seedPlayers } from '#lib/server/test/seed.ts';

// Discord ids are numeric snowflakes; profileFromMember relies on it.
const member = (roles: string[], id = '1001') => ({
	user: { id, username: 'user', global_name: 'Global', avatar: null },
	nick: 'Nick',
	avatar: null,
	roles
});

// Answers the Discord calls by URL; anything else fails the test.
function discord(res: { member?: Response | (() => Response); token?: Response }) {
	const fetch = vi.fn(async (url: string) => {
		if (url.endsWith('/oauth2/token') && res.token) return res.token;
		if (url.includes('/member') && res.member)
			return typeof res.member === 'function' ? res.member() : res.member;
		throw new Error(`unexpected fetch ${url}`);
	});
	vi.stubGlobal('fetch', fetch);
	return fetch;
}
const json = (body: unknown, status = 200) => Response.json(body, { status });

function cookieJar(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	const set = new Map<string, { value: string; opts: Record<string, unknown> }>();
	return {
		get: (k: string) => jar.get(k),
		set: (k: string, value: string, opts: Record<string, unknown>) => {
			jar.set(k, value);
			set.set(k, { value, opts });
		},
		delete: (k: string) => void jar.delete(k),
		jar,
		set_: set
	};
}

const caught = async (p: Promise<unknown> | (() => unknown)) => {
	try {
		await (typeof p === 'function' ? p() : p);
	} catch (e) {
		return e;
	}
	throw new Error('expected a throw');
};
const redirectTo = async (p: Promise<unknown> | (() => unknown)) => {
	const e = await caught(p);
	if (!isRedirect(e)) throw e;
	return e.location;
};

function login(isOrganizer: boolean) {
	const id = 'p1';
	db.insert(players).values({ id, displayName: 'Player 1' }).onConflictDoNothing().run();
	const token = createSession(id, 'access', isOrganizer, new Date(Date.now() + 60_000));
	const row = validateSession(token)!;
	return {
		locals: {
			user: { id, displayName: 'Player 1', avatar: null, isOrganizer },
			session: { id: row.session.id, accessToken: 'access' }
		},
		url: new URL('http://localhost/seasons/s1/admin')
	};
}

afterEach(() => vi.useRealTimers());

describe('sessions', () => {
	it('stores only the token hash', () => {
		const [id] = seedPlayers(1);
		const token = createSession(id, 'access', false, new Date(Date.now() + 60_000));
		const [row] = db.select().from(sessions).all();
		expect(row.id).toBe(createHash('sha256').update(token).digest('hex'));
		expect(row.id).not.toBe(token);
		expect(validateSession(token)?.player.id).toBe(id);
	});

	it('rejects an unknown token', () => {
		expect(validateSession('nope')).toBeNull();
	});

	it('deletes an expired session', () => {
		const [id] = seedPlayers(1);
		const token = createSession(id, 'access', false, new Date(Date.now() - 1000));
		expect(validateSession(token)).toBeNull();
		expect(db.select().from(sessions).all()).toEqual([]);
	});
});

describe('currentRole', () => {
	it('re-checks with Discord at most once a minute', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const fetch = discord({ member: () => json(member([ORGANIZER_ROLE_ID])) });
		const ctx = login(true);
		expect(await currentRole(ctx)).toBe(true);
		expect(await currentRole(ctx)).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(61_000);
		await currentRole(ctx);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('keeps the last known role when Discord rate-limits or fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		discord({ member: json({}, 429) });
		expect(await currentRole(login(true))).toBe(true);
		discord({ member: () => json({}, 500) });
		expect(await currentRole(login(false))).toBe(false);
	});

	it('demotes a revoked organizer and stores it on the session', async () => {
		discord({ member: json(member([])) });
		const ctx = login(true);
		expect(await currentRole(ctx)).toBe(false);
		expect(ctx.locals.user.isOrganizer).toBe(false);
		const [row] = db.select().from(sessions).all();
		expect(row.isOrganizer).toBe(false);
	});

	it('treats a former member as no organizer', async () => {
		discord({ member: json({}, 404) });
		expect(await currentRole(login(true))).toBe(false);
	});

	it('logs out a revoked token', async () => {
		discord({ member: json({}, 401) });
		const ctx = login(true);
		expect(await redirectTo(currentRole(ctx))).toBe('/auth/login?returnTo=%2Fseasons%2Fs1%2Fadmin');
		expect(db.select().from(sessions).all()).toEqual([]);
	});

	it('sends a logged-out visitor to login', async () => {
		const ctx = { locals: { user: null, session: null }, url: new URL('http://localhost/admin') };
		expect(await redirectTo(currentRole(ctx))).toBe('/auth/login?returnTo=%2Fadmin');
	});

	it('organizerPage turns away non-organizers', async () => {
		discord({ member: json(member([])) });
		expect(await redirectTo(organizerPage(login(false)))).toBe('/login/not-organizer');
		discord({ member: json(member([ORGANIZER_ROLE_ID])) });
		const ctx = login(false);
		expect(await organizerPage(ctx)).toBe(ctx.locals.user);
	});
});

describe('hooks.server handle', () => {
	const run = (cookies: ReturnType<typeof cookieJar>) => {
		const event = { cookies, locals: {} } as unknown as Parameters<typeof handle>[0]['event'];
		handle({ event, resolve: async () => new Response() } as Parameters<typeof handle>[0]);
		return event.locals;
	};

	it('fills locals from a valid session', () => {
		const [id] = seedPlayers(1);
		const token = createSession(id, 'access', true, new Date(Date.now() + 60_000));
		const locals = run(cookieJar({ [SESSION_COOKIE]: token }));
		expect(locals.user).toEqual({ id, displayName: 'Player 1', avatar: null, isOrganizer: true });
		expect(locals.session?.accessToken).toBe('access');
	});

	it('clears a stale cookie', () => {
		const cookies = cookieJar({ [SESSION_COOKIE]: 'stale' });
		const locals = run(cookies);
		expect(locals.user).toBeNull();
		expect(locals.session).toBeNull();
		expect(cookies.jar.has(SESSION_COOKIE)).toBe(false);
	});
});

describe('OAuth callback', () => {
	const call = (query: string, cookies: ReturnType<typeof cookieJar>) =>
		redirectTo(
			callback({
				url: new URL(`http://localhost/auth/callback?${query}`),
				cookies
			} as unknown as Parameters<typeof callback>[0]) as Promise<unknown>
		);
	const started = (returnTo = '/seasons/s1') =>
		cookieJar({ oauth_state: 'st', return_to: returnTo });
	const token = (expiresIn = 604_800 * 2) => json({ access_token: 'acc', expires_in: expiresIn });

	it('fails on a missing code or a state mismatch', async () => {
		expect(await call('state=st', started())).toBe('/login/failed');
		expect(await call('code=c&state=other', started())).toBe('/login/failed');
		expect(await call('code=c&state=st', cookieJar())).toBe('/login/failed');
	});

	it('fails when Discord rejects the code', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		discord({ token: json({}, 400) });
		expect(await call('code=c&state=st', started())).toBe('/login/failed');
	});

	it('turns away non-members', async () => {
		discord({ token: token(), member: json({}, 404) });
		expect(await call('code=c&state=st', started())).toBe('/login/not-member');
		expect(db.select().from(players).all()).toEqual([]);
	});

	it('logs in: upserts the profile, sets the role and a capped cookie', async () => {
		db.insert(players).values({ id: '1001', displayName: 'Old name' }).run();
		discord({ token: token(), member: json(member([ORGANIZER_ROLE_ID])) });
		const cookies = started();
		const before = Date.now();
		expect(await call('code=c&state=st', cookies)).toBe('/seasons/s1');

		expect(db.select().from(players).where(eq(players.id, '1001')).get()?.displayName).toBe('Nick');
		const session = validateSession(cookies.set_.get(SESSION_COOKIE)!.value)!;
		expect(session.session.isOrganizer).toBe(true);
		const expires = (cookies.set_.get(SESSION_COOKIE)!.opts.expires as Date).getTime();
		expect(expires - before).toBeLessThanOrEqual(SESSION_TTL_SECONDS * 1000 + 1000);
		expect(expires - before).toBeGreaterThan(SESSION_TTL_SECONDS * 1000 - 1000);
		expect(cookies.set_.get(SESSION_COOKIE)!.opts).toMatchObject({ httpOnly: true, path: '/' });
		expect(cookies.jar.has('oauth_state')).toBe(false);
	});

	it('uses a shorter Discord token lifetime and never redirects off-site', async () => {
		discord({ token: token(3600), member: json(member([])) });
		const cookies = started('//evil.example/x');
		const before = Date.now();
		expect(await call('code=c&state=st', cookies)).toBe('/');
		const expires = (cookies.set_.get(SESSION_COOKIE)!.opts.expires as Date).getTime();
		expect(Math.round((expires - before) / 1000)).toBe(3600);
		expect(validateSession(cookies.set_.get(SESSION_COOKIE)!.value)!.session.isOrganizer).toBe(
			false
		);
	});
});
