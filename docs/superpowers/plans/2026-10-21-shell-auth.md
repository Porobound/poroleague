# Shell & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Owner rule:** work on branch `plan-2-shell-auth`; each commit step needs the owner's go-ahead; open one PR at the end (`Closes #2`). Tick the matching box on issue #2 after each task.

**Goal:** Styled app shell plus Discord login: members of the Porobound guild can log in and out, non-members are refused, and the organizer role is captured in the session.

**Architecture:** Design tokens and component CSS are a verbatim snapshot (`src/lib/styles/porobound.css`) imported by `src/app.css`; Svelte markup uses its `pb-` classes. Discord OAuth is hand-rolled: pure helpers in `src/lib/discord.ts` (unit-tested), HTTP calls in `src/lib/server/discord.ts`, SQLite sessions in `src/lib/server/session.ts` (cookie holds a random token, DB stores its SHA-256), `hooks.server.ts` puts the user on `locals`.

**Tech Stack:** SvelteKit 3 (`$app/env/private`, `@sveltejs/kit/hooks`), Drizzle + better-sqlite3, Vitest, Discord OAuth2 (`identify guilds.members.read`).

**Spec:** `docs/spec.md` → Auth & roles, Visual design.

**Conventions (verified in this repo):**

- Import app code as `#lib/<path>.ts` (with the `.ts` extension). `$lib` does not exist in this SvelteKit version; `#lib/<path>` without extension fails type-checking.
- Env vars are declared in `src/env.ts` and imported from `$app/env/private`. Undeclared vars can't be imported; declared vars must be set when the app starts (`npm run dev`), not for `check`/`build`/tests.
- `redirect()` to another origin needs `{ external: true }`.

**Not in this plan (and where it goes):** organizer re-check on admin actions + "organizers only" page → Plan 3 (first admin action); site nav items and mobile tab bar → Plan 5 (when those pages exist); light theme → later, dark is the design default; Discord-hosted mark/favicon → later.

---

## File map

| File                                         | Responsibility                                               |
| -------------------------------------------- | ------------------------------------------------------------ |
| `src/env.ts`                                 | Declare Discord env vars                                     |
| `.env.example`                               | Document env vars (no secrets)                               |
| `src/lib/styles/porobound.css`               | Design system snapshot (already committed with this plan)    |
| `src/app.css`                                | Imports snapshot; base + shell styles                        |
| `src/app.html`                               | Google Fonts                                                 |
| `src/lib/components/Avatar.svelte`           | Avatar image with initials fallback                          |
| `src/routes/+layout.svelte`                  | Header: brand, login button or user + logout                 |
| `src/routes/+layout.server.ts`               | Expose `locals.user` to pages                                |
| `src/routes/+page.svelte`, `+page.server.ts` | Home: newest season name, or "no season yet" empty state     |
| `src/lib/discord.ts` (+ `.spec.ts`)          | Pure: authorize URL, profile from member, safe return path   |
| `src/lib/server/discord.ts`                  | Discord HTTP: code exchange, guild member lookup             |
| `src/lib/server/session.ts`                  | Create / validate / delete sessions                          |
| `src/hooks.server.ts`                        | Session cookie → `locals.user`, `locals.session`             |
| `src/app.d.ts`                               | `App.Locals` type                                            |
| `src/routes/auth/login/+server.ts`           | Start OAuth (state cookie, redirect to Discord)              |
| `src/routes/auth/callback/+server.ts`        | Finish OAuth: verify state, membership, upsert player, login |
| `src/routes/auth/logout/+server.ts`          | POST: delete session                                         |
| `src/routes/login/not-member/+page.svelte`   | Refusal page (no invite link)                                |
| `src/routes/login/failed/+page.svelte`       | Cancelled/failed login page                                  |
| `CLAUDE.md`                                  | Add import + auth conventions                                |

---

### Task 1: Env vars and Discord application

**Files:**

- Modify: `src/env.ts`
- Modify: `.env.example`

- [x] **Step 1: Owner — create the Discord application (manual, not code)**

1. https://discord.com/developers/applications → New Application → name `Porobound (dev)`.
2. OAuth2 → copy **Client ID**, reset + copy **Client Secret**.
3. OAuth2 → Redirects → add `http://localhost:5173/auth/callback`.
4. In Discord (User Settings → Advanced → Developer Mode on): right-click the Porobound server → Copy Server ID; Server Settings → Roles → right-click the organizer role → Copy Role ID.
5. Put the values in `.env` (gitignored, never commit):

```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:5173/auth/callback
GUILD_ID=...
ORGANIZER_ROLE_ID=...
```

- [x] **Step 2: Declare the vars**

Replace `src/env.ts` with:

```ts
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	DISCORD_CLIENT_ID: { description: 'Discord application client id.' },
	DISCORD_CLIENT_SECRET: { description: 'Discord application client secret.' },
	DISCORD_REDIRECT_URI: { description: 'OAuth redirect, e.g. http://localhost:5173/auth/callback' },
	GUILD_ID: { description: 'Porobound Discord server id.' },
	ORGANIZER_ROLE_ID: { description: 'Discord role id of league organizers.' }
});
```

- [x] **Step 3: Document them**

Replace `.env.example` with:

```
DATABASE_URL=local.db
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:5173/auth/callback
GUILD_ID=
ORGANIZER_ROLE_ID=
```

- [x] **Step 4: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [x] **Step 5: Commit**

```sh
git add src/env.ts .env.example
git commit -m "chore(env): declare Discord OAuth variables"
```

---

### Task 2: App shell from design

**Files:**

- Create: `src/app.css`, `src/lib/components/Avatar.svelte`, `src/routes/+page.server.ts`
- Modify: `src/app.html`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`

- [x] **Step 1: Fonts**

In `src/app.html`, add inside `<head>` before `%sveltekit.head%`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
	rel="stylesheet"
	href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=JetBrains+Mono:wght@500&display=swap"
/>
```

- [x] **Step 2: Base and shell styles**

Create `src/app.css`:

```css
@import './lib/styles/porobound.css';

:root {
	color-scheme: dark;
}
body {
	margin: 0;
	background: var(--surface);
	color: var(--ink);
	font: 400 16px/24px var(--font-sans);
}
a {
	color: var(--accent);
}
a:hover {
	color: var(--ink);
}

.container {
	max-width: 1200px;
	margin: 0 auto;
	padding-inline: var(--space-8);
}
@media (max-width: 640px) {
	.container {
		padding-inline: var(--space-4);
	}
}

.site-header {
	border-bottom: 1px solid var(--line);
}
.site-nav {
	display: flex;
	align-items: center;
	gap: var(--space-4);
	padding-block: var(--space-4);
}
.brand {
	font: 700 24px/1 var(--font-display);
	color: var(--ink);
	text-decoration: none;
	margin-right: auto;
}
.me {
	display: inline-flex;
	align-items: center;
	gap: var(--space-2);
	font-weight: 500;
}

.message-card {
	max-width: 480px;
	margin: 64px auto;
	box-sizing: border-box;
	background: var(--surface-raised);
	border: 1px solid var(--line);
	border-radius: var(--radius-md);
	padding: var(--space-8);
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--space-4);
}
.message-card h1 {
	margin: 0;
	font: 700 28px/34px var(--font-display);
}
.message-card p {
	margin: 0;
	color: var(--ink-muted);
	font-size: 15px;
	line-height: 22px;
}
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
}
.small {
	font-size: 13px;
	line-height: 18px;
}
```

- [x] **Step 3: Avatar component**

Create `src/lib/components/Avatar.svelte`:

```svelte
<script lang="ts">
	let {
		name,
		src = null,
		size = 32
	}: { name: string; src?: string | null; size?: number } = $props();
	const initials = $derived(
		name
			.split(/\s+/)
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);
</script>

{#if src}
	<img class="pb-avatar pb-avatar-img" {src} alt="" width={size} height={size} />
{:else}
	<span class="pb-avatar" style:width="{size}px" style:height="{size}px" aria-hidden="true">
		{initials}
	</span>
{/if}
```

- [x] **Step 4: Layout**

Replace `src/routes/+layout.svelte` (the `data.user` part is wired in Task 4; until then `data.user` is a type error, so this step uses the final version and Task 4 adds the server load):

```svelte
<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const returnTo = $derived(page.url.pathname.startsWith('/login') ? '/' : page.url.pathname);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<nav aria-label="Main" class="container site-nav">
		<a href="/" class="brand">Porobound</a>
		{#if data.user}
			<span class="me">
				<Avatar name={data.user.displayName} src={data.user.avatar} />
				{data.user.displayName}
			</span>
			<form method="POST" action="/auth/logout">
				<button class="pb-btn pb-btn-ghost pb-btn-sm">Log out</button>
			</form>
		{:else}
			<a
				class="pb-btn pb-btn-secondary"
				href="/auth/login?returnTo={encodeURIComponent(returnTo)}"
				data-sveltekit-reload>Log in with Discord</a
			>
		{/if}
	</nav>
</header>

<main class="container">
	{@render children()}
</main>
```

Create `src/routes/+layout.server.ts` now with a temporary null user so the layout type-checks; Task 4 replaces it:

```ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
	user: null as { displayName: string; avatar: string | null } | null
});
```

- [x] **Step 5: Home page**

Create `src/routes/+page.server.ts`:

```ts
import { desc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { seasons } from '#lib/server/db/schema.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	season:
		db
			.select({ name: seasons.name, status: seasons.status })
			.from(seasons)
			.orderBy(desc(seasons.id))
			.limit(1)
			.get() ?? null
});
```

Replace `src/routes/+page.svelte`:

```svelte
<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Porobound</title>
</svelte:head>

{#if data.season}
	<section class="hero">
		<span class="pb-badge">{data.season.status}</span>
		<h1>{data.season.name}</h1>
	</section>
{:else}
	<section class="hero">
		<span class="pb-badge">No season yet</span>
		<h1>The herd is gathering.</h1>
		<p>The first season hasn't been set up yet. It will be announced in the Porobound Discord.</p>
	</section>
{/if}

<style>
	.hero {
		max-width: 560px;
		margin: 96px auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		text-align: center;
	}
	h1 {
		margin: 0;
		font: 700 48px/52px var(--font-display);
		letter-spacing: -0.02em;
	}
	p {
		margin: 0;
		font-size: 18px;
		line-height: 28px;
		color: var(--ink-muted);
	}
</style>
```

- [x] **Step 6: Verify**

Run: `npm run check`
Expected: 0 errors.

Run: `npm run dev`, open http://localhost:5173.
Expected: dark page, Bricolage "Porobound" brand top-left, "Log in with Discord" button top-right, centered "The herd is gathering." empty state. At 390px width: no horizontal scroll. Stop the server.

- [x] **Step 7: Commit**

```sh
git add src/app.css src/app.html src/lib/components/Avatar.svelte src/routes/+layout.svelte src/routes/+layout.server.ts src/routes/+page.svelte src/routes/+page.server.ts
git commit -m "feat(ui): app shell and home empty state from design"
```

---

### Task 3: Discord helpers (pure)

**Files:**

- Create: `src/lib/discord.ts`
- Test: `src/lib/discord.spec.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/discord.spec.ts`:

```ts
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
		for (const bad of [null, '', 'https://evil.com', '//evil.com', '/\\evil.com']) {
			expect(safeReturnTo(bad)).toBe('/');
		}
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/discord.spec.ts`
Expected: FAIL — cannot resolve `./discord`.

- [x] **Step 3: Implement**

Create `src/lib/discord.ts`:

```ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/discord.spec.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```sh
git add src/lib/discord.ts src/lib/discord.spec.ts
git commit -m "feat(auth): Discord authorize URL, member profile, safe return path"
```

---

### Task 4: Sessions and hooks

**Files:**

- Create: `src/lib/server/session.ts`, `src/hooks.server.ts`
- Modify: `src/app.d.ts`, `src/routes/+layout.server.ts`

- [ ] **Step 1: Locals type**

Replace `src/app.d.ts`:

```ts
declare global {
	namespace App {
		interface Locals {
			user: { id: string; displayName: string; avatar: string | null; isOrganizer: boolean } | null;
			session: { id: string; accessToken: string } | null;
		}
	}
}

export {};
```

- [ ] **Step 2: Session store**

Create `src/lib/server/session.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { players, sessions } from '#lib/server/db/schema.ts';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// The cookie holds a random token; the DB only stores its hash, so a leaked DB can't be replayed as cookies.
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(
	playerId: string,
	accessToken: string,
	isOrganizer: boolean,
	expiresAt: Date
): string {
	const token = randomBytes(32).toString('base64url');
	db.insert(sessions)
		.values({ id: hash(token), playerId, accessToken, isOrganizer, expiresAt })
		.run();
	return token;
}

export function validateSession(token: string) {
	const row = db
		.select({ session: sessions, player: players })
		.from(sessions)
		.innerJoin(players, eq(sessions.playerId, players.id))
		.where(eq(sessions.id, hash(token)))
		.get();
	if (!row) return null;
	if (row.session.expiresAt < new Date()) {
		deleteSession(row.session.id);
		return null;
	}
	return row;
}

export function deleteSession(id: string) {
	db.delete(sessions).where(eq(sessions.id, id)).run();
}
```

- [ ] **Step 3: Hook**

Create `src/hooks.server.ts`:

```ts
import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, validateSession } from '#lib/server/session.ts';

export const handle: Handle = ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	const row = token ? validateSession(token) : null;
	if (token && !row) event.cookies.delete(SESSION_COOKIE, { path: '/' });

	event.locals.user = row
		? {
				id: row.player.id,
				displayName: row.player.displayName,
				avatar: row.player.avatar,
				isOrganizer: row.session.isOrganizer
			}
		: null;
	event.locals.session = row ? { id: row.session.id, accessToken: row.session.accessToken } : null;
	return resolve(event);
};
```

- [ ] **Step 4: Expose the user to pages**

Replace `src/routes/+layout.server.ts`:

```ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({ user: locals.user });
```

- [ ] **Step 5: Verify**

Run: `npm run check && npx vitest run`
Expected: 0 errors; 5 test files, 22 tests passing.

Run: `npm run dev`, open http://localhost:5173 — page still renders logged out. Stop the server.

- [ ] **Step 6: Commit**

```sh
git add src/app.d.ts src/lib/server/session.ts src/hooks.server.ts src/routes/+layout.server.ts
git commit -m "feat(auth): SQLite sessions and session hook"
```

---

### Task 5: Login, callback, logout, refusal pages

**Files:**

- Create: `src/lib/server/discord.ts`, `src/routes/auth/login/+server.ts`, `src/routes/auth/callback/+server.ts`, `src/routes/auth/logout/+server.ts`, `src/routes/login/not-member/+page.svelte`, `src/routes/login/failed/+page.svelte`

- [ ] **Step 1: Discord HTTP calls**

Create `src/lib/server/discord.ts`:

```ts
import {
	DISCORD_CLIENT_ID,
	DISCORD_CLIENT_SECRET,
	DISCORD_REDIRECT_URI,
	GUILD_ID
} from '$app/env/private';
import type { GuildMember } from '#lib/discord.ts';

const API = 'https://discord.com/api/v10';

export type MemberResult =
	{ status: 'member'; member: GuildMember } | { status: 'not-member' } | { status: 'unauthorized' };

export async function exchangeCode(
	code: string
): Promise<{ accessToken: string; expiresIn: number }> {
	const res = await fetch(`${API}/oauth2/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: DISCORD_CLIENT_ID,
			client_secret: DISCORD_CLIENT_SECRET,
			grant_type: 'authorization_code',
			code,
			redirect_uri: DISCORD_REDIRECT_URI
		})
	});
	if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
	const body = (await res.json()) as { access_token: string; expires_in: number };
	return { accessToken: body.access_token, expiresIn: body.expires_in };
}

// One call answers both "is a member?" (404 = no) and "which roles?".
export async function fetchMember(accessToken: string): Promise<MemberResult> {
	const res = await fetch(`${API}/users/@me/guilds/${GUILD_ID}/member`, {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	if (res.status === 404) return { status: 'not-member' };
	if (res.status === 401) return { status: 'unauthorized' };
	if (!res.ok) throw new Error(`Discord member lookup failed: ${res.status}`);
	return { status: 'member', member: (await res.json()) as GuildMember };
}
```

- [ ] **Step 2: Start login**

Create `src/routes/auth/login/+server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI } from '$app/env/private';
import { authorizeUrl, safeReturnTo } from '#lib/discord.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, cookies }) => {
	const state = randomBytes(16).toString('base64url');
	const opts = { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600 } as const;
	cookies.set('oauth_state', state, opts);
	cookies.set('return_to', safeReturnTo(url.searchParams.get('returnTo')), opts);
	redirect(
		302,
		authorizeUrl({ clientId: DISCORD_CLIENT_ID, redirectUri: DISCORD_REDIRECT_URI, state }),
		{
			external: true
		}
	);
};
```

- [ ] **Step 3: Callback**

Create `src/routes/auth/callback/+server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import { GUILD_ID, ORGANIZER_ROLE_ID } from '$app/env/private';
import { profileFromMember, safeReturnTo } from '#lib/discord.ts';
import { db } from '#lib/server/db/index.ts';
import { players } from '#lib/server/db/schema.ts';
import { exchangeCode, fetchMember } from '#lib/server/discord.ts';
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

async function discordLogin(code: string) {
	const { accessToken, expiresIn } = await exchangeCode(code);
	return { accessToken, expiresIn, result: await fetchMember(accessToken) };
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = cookies.get('oauth_state');
	const returnTo = safeReturnTo(cookies.get('return_to') ?? null);
	cookies.delete('oauth_state', { path: '/' });
	cookies.delete('return_to', { path: '/' });

	const code = url.searchParams.get('code');
	if (!code || !state || url.searchParams.get('state') !== state) redirect(303, '/login/failed');

	const login = await discordLogin(code).catch((e) => {
		console.error(e);
		return null;
	});
	if (!login || login.result.status === 'unauthorized') redirect(303, '/login/failed');
	if (login.result.status === 'not-member') redirect(303, '/login/not-member');

	const { member } = login.result;
	const profile = profileFromMember(member, GUILD_ID);
	db.insert(players)
		.values(profile)
		.onConflictDoUpdate({
			target: players.id,
			set: { displayName: profile.displayName, avatar: profile.avatar }
		})
		.run();

	const expiresAt = new Date(Date.now() + Math.min(login.expiresIn, SESSION_TTL_SECONDS) * 1000);
	const token = createSession(
		profile.id,
		login.accessToken,
		member.roles.includes(ORGANIZER_ROLE_ID),
		expiresAt
	);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
	redirect(303, returnTo);
};
```

- [ ] **Step 4: Logout**

Create `src/routes/auth/logout/+server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import { deleteSession, SESSION_COOKIE } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies, locals }) => {
	if (locals.session) deleteSession(locals.session.id);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/');
};
```

- [ ] **Step 5: Refusal pages (copy from design; no invite link — Porobound is private)**

Create `src/routes/login/not-member/+page.svelte`:

```svelte
<svelte:head>
	<title>Members only · Porobound</title>
</svelte:head>

<section class="message-card">
	<span class="pb-badge pb-badge-rank">Members only</span>
	<h1>This account isn't in Porobound</h1>
	<p>
		Porobound is a private Discord server, and only its members can sign up or report. The Discord
		account you logged in with isn't a member. If you use another Discord account for Porobound, log
		in with that one.
	</p>
	<div class="actions">
		<a class="pb-btn pb-btn-primary" href="/auth/login" data-sveltekit-reload
			>Log in with another account</a
		>
		<a class="pb-btn pb-btn-secondary" href="/">Back to the season</a>
	</div>
	<p class="small">
		Standings, schedules and results stay public, so you can keep browsing without logging in.
	</p>
</section>
```

Create `src/routes/login/failed/+page.svelte`:

```svelte
<svelte:head>
	<title>Login didn't go through · Porobound</title>
</svelte:head>

<section class="message-card">
	<h1>Login didn't go through</h1>
	<p>
		Discord login was cancelled or didn't finish. Nothing was changed. Try again, and allow access
		when Discord asks.
	</p>
	<div class="actions">
		<a class="pb-btn pb-btn-primary" href="/auth/login" data-sveltekit-reload
			>Try again with Discord</a
		>
		<a class="pb-btn pb-btn-secondary" href="/">Back to the season</a>
	</div>
</section>
```

- [ ] **Step 6: Typecheck and tests**

Run: `npm run check && npx vitest run`
Expected: 0 errors; 22 tests passing.

- [ ] **Step 7: Commit**

```sh
git add src/lib/server/discord.ts src/routes/auth src/routes/login
git commit -m "feat(auth): Discord login, callback, logout, refusal pages"
```

---

### Task 6: End-to-end check, docs, PR

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Happy path (needs `.env` from Task 1)**

Run: `npm run db:migrate && npm run dev`, open http://localhost:5173, click "Log in with Discord", approve.
Expected: back on `/`, header shows your server nickname + avatar and "Log out".

Run: `sqlite3 local.db "select id, display_name from players; select player_id, is_organizer, datetime(expires_at,'unixepoch') from sessions;"`
Expected: one player row (your Discord id, server nickname); one session with `is_organizer` = 1 if you have the organizer role, expiry ~7 days out.

- [ ] **Step 2: Logout**

Click "Log out".
Expected: back on `/` logged out; `sqlite3 local.db "select count(*) from sessions;"` → `0`.

- [ ] **Step 3: Refusals**

1. Click login, then "Cancel" on Discord's screen → `/login/failed`.
2. Stop the server, set `GUILD_ID=1` in `.env`, start it, log in → `/login/not-member` (Discord answers 404 for a guild you're not in). Restore `GUILD_ID`.
3. Open `http://localhost:5173/auth/callback?code=x&state=forged` → `/login/failed`.

- [ ] **Step 4: Return path**

Open `http://localhost:5173/login/failed`, click "Log in with Discord" in the header (logged out), approve.
Expected: lands on `/`, not back on the failure page.

- [ ] **Step 5: Document conventions**

In `CLAUDE.md`, under `## Rules`, add:

```markdown
- Import app code as `#lib/<path>.ts` (extension required); there is no `$lib`.
- Env vars: declare in `src/env.ts`, import from `$app/env/private`.
- Styles: `src/lib/styles/porobound.css` is a verbatim design-system snapshot (`pb-` classes); replace it wholesale to re-sync, put app styles in `src/app.css`.
- Auth: `locals.user` (with `isOrganizer` from login) is set in `hooks.server.ts`. Admin actions must re-check the role with Discord (`fetchMember`), not trust the session flag.
```

- [ ] **Step 6: Full verification**

Run: `npm run check && npx vitest run && npm run build && npx prettier --check .`
Expected: 0 errors; 5 test files, 22 tests; build succeeds; prettier clean.

- [ ] **Step 7: Commit and PR**

```sh
git add CLAUDE.md docs/superpowers/plans/2026-10-21-shell-auth.md
git commit -m "docs: auth and styling conventions"
git push -u origin plan-2-shell-auth
gh pr create --title "Plan 2: Shell & auth" --body "Closes #2"
```
