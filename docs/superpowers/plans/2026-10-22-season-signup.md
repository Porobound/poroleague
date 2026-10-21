# Season & Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Owner rule:** work on branch `plan-3-season-signup`; per-task commits once the owner approves the plan; tick the matching box on issue #3 after each task; ask before push/PR. The PR body starts with `Closes #3`. PRs are never added to the project board.

**Goal:** Organizers can create a season, open and close signup, draw and adjust groups, and lock them to generate the round-robin schedule; players can sign up and withdraw.

**Architecture:** Season rules that need no DB are pure and unit-tested: form parsing, editable fields per status and slugify in `src/lib/season.ts`, and schedule building in `src/lib/league/schedule.ts`. DB access for seasons lives in `src/lib/server/seasons.ts`. Pages use plain SvelteKit form actions; irreversible or public actions go through `ConfirmButton`, the design's ConfirmDialog built on the native `<dialog>` element. Admin page loads re-check the role with Discord at most once a minute per session (`organizerPage`); every admin **action** re-checks it every time (`organizerAction`). Changed during execution: trusting the login-time flag on loads meant role changes needed a re-login.

**Tech Stack:** SvelteKit 3 form actions, Drizzle + better-sqlite3 (sync API: `.get()`, `.all()`, `.run()`, `db.transaction`), Vitest.

**Spec:** `docs/spec.md` → Season lifecycle, Organizer powers, Pages.

**Conventions (from `CLAUDE.md`):** imports are `#lib/<path>.ts`; env from `$app/env/private`; style with `pb-` classes from `src/lib/styles/porobound.css` plus app classes in `src/app.css`; `redirect()`/`error()` throw.

**Decisions made in this plan:**

- Admin entry point is `/admin` (season list + "New season" form). Per-season admin is `/seasons/[slug]/admin` with three pages: Season (settings + phase buttons), Players, Groups. Overview/Matches pages come with Plans 4 and 6.
- Closing signup draws the groups immediately (status `signup → groups`), as in the design: "Groups were drawn at random."
- Group count stays automatic (1 if < 16, else 2). Moving a player switches them to the other group.
- Editable fields per status: draft = all; signup/groups = all but slug; play = name + deadline; finished = none.
- `/`: the newest non-draft season if it isn't finished → redirect to it; otherwise, if a draft exists → "Next season coming soon"; otherwise the newest finished season; otherwise the empty state. (This fixes the spec's "newest is a draft" rule, which would hide a running season while the next one is being set up.)
- Draft seasons 404 for everyone except organizers.
- Confirmations use `ConfirmButton` (design's ConfirmDialog on native `<dialog>`: focus trap, Esc and backdrop for free). Success messages show inline (`.status`, `role="status"`) instead of the design's Toast.
- Season admin actions are not audit-logged (the spec's audit log covers result changes and drops).

**Not in this plan:** standings/schedule pages (Plan 5), drops and pairings post (Plan 6), mobile nav (Plan 5).

---

## File map

| File                                                                      | Responsibility                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/lib/season.ts` (+ `.spec.ts`)                                        | Pure: slugify, season form parsing/validation, editable fields per status, labels |
| `src/lib/league/schedule.ts` (+ `.spec.ts`)                               | Pure: groups → list of scheduled matches                                          |
| `src/lib/server/session.ts`                                               | + `setOrganizer`                                                                  |
| `src/lib/server/auth.ts`                                                  | `organizerPage`, `organizerAction` (Discord re-check), `playerAction`             |
| `src/lib/server/seasons.ts`                                               | Season/entry queries, draw, lock                                                  |
| `src/lib/components/ConfirmButton.svelte`                                 | Button that opens a confirm dialog, then posts the form                           |
| `src/lib/components/SeasonForm.svelte`                                    | Season settings fields                                                            |
| `src/app.css`                                                             | + page, panel, admin layout, list styles                                          |
| `src/routes/+layout.svelte`                                               | + "Admin" link for organizers                                                     |
| `src/routes/+page.server.ts`, `+page.svelte`                              | Home routing: redirect / coming soon / empty                                      |
| `src/routes/login/not-organizer/+page.svelte`                             | Organizers-only page                                                              |
| `src/routes/admin/+page.server.ts`, `+page.svelte`                        | Season list + create                                                              |
| `src/routes/seasons/[slug]/+page.server.ts`, `+page.svelte`               | Public season page, signup/withdraw                                               |
| `src/routes/seasons/[slug]/admin/+layout.server.ts`, `+layout.svelte`     | Admin guard + sidebar                                                             |
| `src/routes/seasons/[slug]/admin/+page.server.ts`, `+page.svelte`         | Settings, open/close signup                                                       |
| `src/routes/seasons/[slug]/admin/players/+page.server.ts`, `+page.svelte` | Signups list, remove                                                              |
| `src/routes/seasons/[slug]/admin/groups/+page.server.ts`, `+page.svelte`  | Draw preview, move, redraw, lock                                                  |
| `scripts/seed-dev.ts`, `package.json`                                     | Dev-only: sign up N fake players                                                  |
| `docs/spec.md`                                                            | `/` rule, `/admin` route                                                          |

---

### Task 1: Season helpers (pure)

**Files:**

- Create: `src/lib/season.ts`
- Test: `src/lib/season.spec.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/season.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { editableFields, NEW_SEASON, parseSeasonForm, slugify, type SeasonFields } from './season';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const valid = {
	name: 'Season 1',
	slug: '',
	startDate: '2026-11-02',
	roundsPerWeek: '2',
	deadline: '2026-12-20',
	topCutSize: '4'
};
const all = editableFields('draft');

describe('slugify', () => {
	it('lowercases, strips accents and joins words with dashes', () => {
		expect(slugify('  Season 1: Kevät Ähky! ')).toBe('season-1-kevat-ahky');
	});
});

describe('parseSeasonForm', () => {
	it('parses a valid form and derives the slug from the name', () => {
		expect(parseSeasonForm(form(valid), NEW_SEASON, all)).toEqual({
			ok: true,
			values: {
				name: 'Season 1',
				slug: 'season-1',
				startDate: '2026-11-02',
				roundsPerWeek: 2,
				deadline: '2026-12-20',
				topCutSize: 4
			}
		});
	});

	it('reports each invalid field', () => {
		const result = parseSeasonForm(
			form({
				...valid,
				name: '',
				slug: 'Bad Slug!',
				startDate: '2026-02-30',
				roundsPerWeek: '0',
				topCutSize: '17'
			}),
			NEW_SEASON,
			all
		);
		expect(result.ok).toBe(false);
		expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual([
			'name',
			'roundsPerWeek',
			'slug',
			'startDate',
			'topCutSize'
		]);
	});

	it('requires the deadline to be after the start date', () => {
		const result = parseSeasonForm(form({ ...valid, deadline: '2026-11-02' }), NEW_SEASON, all);
		expect(result.ok ? null : result.errors).toEqual({
			deadline: 'The deadline must be after the start date.'
		});
	});

	it('keeps current values for locked fields, whatever the form says', () => {
		const current: SeasonFields = {
			name: 'Season 1',
			slug: 'season-1',
			startDate: '2026-11-02',
			roundsPerWeek: 2,
			deadline: '2026-12-20',
			topCutSize: 4
		};
		const result = parseSeasonForm(
			form({ name: 'Autumn', slug: 'hacked', roundsPerWeek: '4', deadline: '2026-12-27' }),
			current,
			editableFields('play')
		);
		expect(result).toEqual({
			ok: true,
			values: { ...current, name: 'Autumn', deadline: '2026-12-27' }
		});
	});
});

describe('editableFields', () => {
	it('narrows as the season progresses', () => {
		expect(editableFields('signup')).not.toContain('slug');
		expect(editableFields('play')).toEqual(['name', 'deadline']);
		expect(editableFields('finished')).toEqual([]);
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/season.spec.ts`
Expected: FAIL — cannot resolve `./season`.

- [x] **Step 3: Implement**

Create `src/lib/season.ts`:

```ts
export type SeasonStatus = 'draft' | 'signup' | 'groups' | 'play' | 'finished';
export type SeasonFields = {
	name: string;
	slug: string;
	startDate: string;
	roundsPerWeek: number;
	deadline: string;
	topCutSize: number;
};
export type SeasonField = keyof SeasonFields;
export type FieldErrors = Partial<Record<SeasonField, string>>;
export type ParseResult =
	| { ok: true; values: SeasonFields }
	| { ok: false; errors: FieldErrors; raw: Record<SeasonField, string> };

export const FIELDS: SeasonField[] = [
	'name',
	'slug',
	'startDate',
	'roundsPerWeek',
	'deadline',
	'topCutSize'
];
export const NEW_SEASON: SeasonFields = {
	name: '',
	slug: '',
	startDate: '',
	roundsPerWeek: 2,
	deadline: '',
	topCutSize: 4
};

export const STATUS_LABEL: Record<SeasonStatus, string> = {
	draft: 'Draft',
	signup: 'Signup open',
	groups: 'Drawing groups',
	play: 'In play',
	finished: 'Finished'
};

const EDITABLE: Record<SeasonStatus, SeasonField[]> = {
	draft: FIELDS,
	signup: ['name', 'startDate', 'roundsPerWeek', 'deadline', 'topCutSize'],
	groups: ['name', 'startDate', 'roundsPerWeek', 'deadline', 'topCutSize'],
	play: ['name', 'deadline'],
	finished: []
};

export const editableFields = (status: SeasonStatus) => EDITABLE[status];
export const groupName = (n: number) => `Group ${String.fromCharCode(64 + n)}`;

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function seasonFields(s: {
	name: string;
	slug: string;
	startDate: string | null;
	roundsPerWeek: number;
	deadline: string | null;
	topCutSize: number | null;
}): SeasonFields {
	return {
		name: s.name,
		slug: s.slug,
		startDate: s.startDate ?? '',
		roundsPerWeek: s.roundsPerWeek,
		deadline: s.deadline ?? '',
		topCutSize: s.topCutSize ?? NEW_SEASON.topCutSize
	};
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(s: string): boolean {
	if (!DATE.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function int(s: string, min: number, max: number): number | null {
	const n = Number(s);
	return s !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Locked fields always keep their current value, so a crafted form can't change them.
export function parseSeasonForm(
	form: FormData,
	current: SeasonFields,
	editable: SeasonField[]
): ParseResult {
	const raw = Object.fromEntries(
		FIELDS.map((k) => [
			k,
			editable.includes(k) ? String(form.get(k) ?? '').trim() : String(current[k])
		])
	) as Record<SeasonField, string>;
	if (editable.includes('slug') && !raw.slug) raw.slug = slugify(raw.name);

	const errors: FieldErrors = {};
	if (!raw.name || raw.name.length > 60)
		errors.name = 'Give the season a name (up to 60 characters).';
	if (!SLUG.test(raw.slug)) errors.slug = 'Use lowercase letters, numbers and dashes.';
	if (!isDate(raw.startDate)) errors.startDate = 'Pick a start date.';
	if (!isDate(raw.deadline)) errors.deadline = 'Pick a deadline.';
	else if (isDate(raw.startDate) && raw.deadline <= raw.startDate)
		errors.deadline = 'The deadline must be after the start date.';
	const roundsPerWeek = int(raw.roundsPerWeek, 1, 4);
	if (roundsPerWeek === null) errors.roundsPerWeek = 'Between 1 and 4.';
	const topCutSize = int(raw.topCutSize, 0, 16);
	if (topCutSize === null) errors.topCutSize = 'Between 0 and 16.';

	if (roundsPerWeek === null || topCutSize === null || Object.keys(errors).length)
		return { ok: false, errors, raw };
	return {
		ok: true,
		values: {
			name: raw.name,
			slug: raw.slug,
			startDate: raw.startDate,
			roundsPerWeek,
			deadline: raw.deadline,
			topCutSize
		}
	};
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/season.spec.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Commit**

```sh
git add src/lib/season.ts src/lib/season.spec.ts
git commit -m "feat(season): form parsing, editable fields, slugify"
```

---

### Task 2: Schedule builder (pure)

**Files:**

- Create: `src/lib/league/schedule.ts`
- Test: `src/lib/league/schedule.spec.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/league/schedule.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSchedule } from './schedule';

describe('buildSchedule', () => {
	it('numbers groups and rounds from 1 and keeps players inside their group', () => {
		const schedule = buildSchedule([
			['a1', 'a2', 'a3', 'a4'],
			['b1', 'b2', 'b3']
		]);
		const groupA = schedule.filter((m) => m.group === 1);
		const groupB = schedule.filter((m) => m.group === 2);
		expect(groupA).toHaveLength(6);
		expect(groupB).toHaveLength(3);
		expect(new Set(groupA.map((m) => m.round))).toEqual(new Set([1, 2, 3]));
		expect(groupB.every((m) => m.p1.startsWith('b') && m.p2.startsWith('b'))).toBe(true);
	});

	it('is empty for no groups', () => {
		expect(buildSchedule([])).toEqual([]);
	});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/league/schedule.spec.ts`
Expected: FAIL — cannot resolve `./schedule`.

- [x] **Step 3: Implement**

Create `src/lib/league/schedule.ts`:

```ts
import { roundRobin } from './roundRobin';

export type ScheduledMatch = { group: number; round: number; p1: string; p2: string };

export function buildSchedule(groups: string[][]): ScheduledMatch[] {
	return groups.flatMap((players, g) =>
		roundRobin(players).flatMap((pairs, r) =>
			pairs.map(([p1, p2]) => ({ group: g + 1, round: r + 1, p1, p2 }))
		)
	);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/league/schedule.spec.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```sh
git add src/lib/league/schedule.ts src/lib/league/schedule.spec.ts
git commit -m "feat(league): schedule from groups"
```

---

### Task 3: Organizer guards and organizers-only page

**Files:**

- Modify: `src/lib/server/session.ts`, `src/routes/+layout.svelte`
- Create: `src/lib/server/auth.ts`, `src/routes/login/not-organizer/+page.svelte`

- [x] **Step 1: `setOrganizer`**

Append to `src/lib/server/session.ts`:

```ts
export function setOrganizer(id: string, isOrganizer: boolean) {
	db.update(sessions).set({ isOrganizer }).where(eq(sessions.id, id)).run();
}
```

- [x] **Step 2: Guards**

Create `src/lib/server/auth.ts`:

```ts
import { error, redirect } from '@sveltejs/kit';
import { ORGANIZER_ROLE_ID } from '$app/env/private';
import { fetchMember } from '#lib/server/discord.ts';
import { deleteSession, setOrganizer } from '#lib/server/session.ts';

type Ctx = { locals: App.Locals; url: URL };

const loginUrl = (url: URL) => `/auth/login?returnTo=${encodeURIComponent(url.pathname)}`;

export function playerAction({ locals, url }: Ctx) {
	if (!locals.user) redirect(303, loginUrl(url));
	return locals.user;
}

// Page loads trust the role stored at login.
export function organizerPage({ locals, url }: Ctx) {
	if (!locals.user) redirect(303, loginUrl(url));
	if (!locals.user.isOrganizer) redirect(303, '/login/not-organizer');
	return locals.user;
}

// Actions ask Discord again, so a removed role stops working immediately (spec: Auth & roles).
export async function organizerAction({ locals, url }: Ctx) {
	if (!locals.user || !locals.session) redirect(303, loginUrl(url));
	const result = await fetchMember(locals.session.accessToken).catch((e) => {
		console.error(e);
		error(503, "Discord didn't answer. Try again in a moment.");
	});
	if (result.status === 'unauthorized') {
		deleteSession(locals.session.id);
		redirect(303, loginUrl(url));
	}
	const isOrganizer = result.status === 'member' && result.member.roles.includes(ORGANIZER_ROLE_ID);
	if (isOrganizer !== locals.user.isOrganizer) setOrganizer(locals.session.id, isOrganizer);
	if (!isOrganizer) redirect(303, '/login/not-organizer');
	return locals.user;
}
```

- [x] **Step 3: Organizers-only page (design copy)**

Create `src/routes/login/not-organizer/+page.svelte`:

```svelte
<svelte:head>
	<title>Organizers only · Poroleague</title>
</svelte:head>

<section class="message-card">
	<span class="pb-badge">Admin</span>
	<h1>Organizers only</h1>
	<p>
		The admin pages are for people with the organizer role in the Porobound Discord. Your account
		doesn't have it. If you think it should, ask an organizer in the server.
	</p>
	<div class="actions">
		<a class="pb-btn pb-btn-primary" href="/">Back to the season</a>
	</div>
</section>
```

- [x] **Step 4: Admin link in the header**

In `src/routes/+layout.svelte`, inside `{#if data.user}` before `<span class="me">`, add:

```svelte
{#if data.user.isOrganizer}
	<a href="/admin" class="nav-link">Admin</a>
{/if}
```

Append to `src/app.css`:

```css
.nav-link {
	color: var(--ink-muted);
	text-decoration: none;
	font-weight: 500;
	font-size: 15px;
}
.nav-link:hover,
.nav-link[aria-current='page'] {
	color: var(--ink);
}
```

- [x] **Step 5: Verify**

Run: `npm run check`
Expected: 0 errors.

Open http://localhost:5173/login/not-organizer — the card renders. Logged in as an organizer, the header shows "Admin".

- [x] **Step 6: Commit**

```sh
git add src/lib/server/session.ts src/lib/server/auth.ts src/routes/login/not-organizer src/routes/+layout.svelte src/app.css
git commit -m "feat(auth): organizer guards with Discord re-check on actions"
```

---

### Task 4: Season data access

**Files:**

- Create: `src/lib/server/seasons.ts`

- [x] **Step 1: Queries and season operations**

Create `src/lib/server/seasons.ts`:

```ts
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { defaultGroupCount, splitGroups } from '#lib/league/groups.ts';
import { buildSchedule } from '#lib/league/schedule.ts';
import type { SeasonFields, SeasonStatus } from '#lib/season.ts';
import { db } from '#lib/server/db/index.ts';
import { entries, matches, players, seasons } from '#lib/server/db/schema.ts';

export type Season = typeof seasons.$inferSelect;

export function getSeason(slug: string, viewer: App.Locals['user']): Season {
	const season = db.select().from(seasons).where(eq(seasons.slug, slug)).get();
	if (!season || (season.status === 'draft' && !viewer?.isOrganizer))
		error(404, 'Season not found');
	return season;
}

export const allSeasons = () => db.select().from(seasons).orderBy(desc(seasons.id)).all();

export const latestSeason = (status: 'draft' | 'not-draft') =>
	db
		.select()
		.from(seasons)
		.where(status === 'draft' ? eq(seasons.status, 'draft') : ne(seasons.status, 'draft'))
		.orderBy(desc(seasons.id))
		.limit(1)
		.get();

export const slugTaken = (slug: string, exceptId = -1) =>
	!!db
		.select({ id: seasons.id })
		.from(seasons)
		.where(and(eq(seasons.slug, slug), ne(seasons.id, exceptId)))
		.get();

export function createSeason(values: SeasonFields) {
	db.insert(seasons).values(values).run();
}

export function updateSeason(id: number, values: SeasonFields) {
	db.update(seasons).set(values).where(eq(seasons.id, id)).run();
}

export function setStatus(id: number, status: SeasonStatus) {
	db.update(seasons).set({ status }).where(eq(seasons.id, id)).run();
}

export function seasonEntries(seasonId: number) {
	return db
		.select({
			playerId: players.id,
			displayName: players.displayName,
			avatar: players.avatar,
			group: entries.group
		})
		.from(entries)
		.innerJoin(players, eq(entries.playerId, players.id))
		.where(eq(entries.seasonId, seasonId))
		.orderBy(asc(players.displayName))
		.all();
}

export type SeasonEntry = ReturnType<typeof seasonEntries>[number];

export function addEntry(seasonId: number, playerId: string) {
	db.insert(entries).values({ seasonId, playerId }).onConflictDoNothing().run();
}

export function removeEntry(seasonId: number, playerId: string) {
	db.delete(entries)
		.where(and(eq(entries.seasonId, seasonId), eq(entries.playerId, playerId)))
		.run();
}

export function setGroup(seasonId: number, playerId: string, group: number) {
	db.update(entries)
		.set({ group })
		.where(and(eq(entries.seasonId, seasonId), eq(entries.playerId, playerId)))
		.run();
}

export function drawGroups(seasonId: number) {
	const ids = seasonEntries(seasonId).map((e) => e.playerId);
	const groups = splitGroups(ids, defaultGroupCount(ids.length));
	db.transaction(() => groups.forEach((g, i) => g.forEach((id) => setGroup(seasonId, id, i + 1))));
}

// Entries split by group number (1-based); index 0 is group 1.
export function groupsOf(list: SeasonEntry[]): SeasonEntry[][] {
	const count = Math.max(0, ...list.map((e) => e.group ?? 0));
	return Array.from({ length: count }, (_, i) => list.filter((e) => e.group === i + 1));
}

export function lockGroups(seasonId: number) {
	const groups = groupsOf(seasonEntries(seasonId)).map((g) => g.map((e) => e.playerId));
	const schedule = buildSchedule(groups);
	db.transaction((tx) => {
		tx.insert(matches)
			.values(
				schedule.map((m) => ({ seasonId, group: m.group, round: m.round, p1Id: m.p1, p2Id: m.p2 }))
			)
			.run();
		tx.update(seasons).set({ status: 'play' }).where(eq(seasons.id, seasonId)).run();
	});
}
```

- [x] **Step 2: Verify**

Run: `npm run check`
Expected: 0 errors.

- [x] **Step 3: Commit**

```sh
git add src/lib/server/seasons.ts
git commit -m "feat(season): season and entry data access, draw and lock"
```

---

### Task 5: Shared page styles, season form, confirm button

**Files:**

- Modify: `src/app.css`
- Create: `src/lib/components/SeasonForm.svelte`, `src/lib/components/ConfirmButton.svelte`

- [x] **Step 1: Styles**

Append to `src/app.css`:

```css
.page {
	padding-block: var(--space-8) 64px;
	display: flex;
	flex-direction: column;
	gap: 24px;
}
.page h1 {
	margin: 0;
	font: 700 32px/38px var(--font-display);
	letter-spacing: -0.01em;
}
.page h2 {
	margin: 0;
	font: 600 22px/28px var(--font-display);
}
.eyebrow {
	font: 600 12px/16px var(--font-sans);
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--ink-muted);
}
.muted {
	color: var(--ink-muted);
}
.panel {
	background: var(--surface-raised);
	border: 1px solid var(--line);
	border-radius: var(--radius-md);
	padding: 24px;
}
.status {
	border: 1px solid var(--accent);
	border-radius: var(--radius-md);
	padding: 12px 16px;
	font-weight: 600;
}
.status.is-error {
	border-color: var(--brand);
}
.player-list {
	list-style: none;
	margin: 0;
	padding: 0;
}
.player-list li {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 0;
	border-top: 1px solid var(--line);
}
.player-list .grow {
	flex: 1;
	min-width: 0;
}
.grid-2 {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
	gap: 24px;
}
.admin {
	display: flex;
	flex-wrap: wrap;
	gap: 32px;
	align-items: flex-start;
	padding-block: var(--space-8) 64px;
}
.admin-nav {
	flex: 1 1 200px;
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.admin-nav a {
	padding: 10px 12px;
	border-radius: var(--radius-sm);
	color: var(--ink-muted);
	text-decoration: none;
	font-weight: 500;
	font-size: 15px;
}
.admin-nav a[aria-current='page'] {
	background: var(--frost);
	color: var(--ink);
	font-weight: 600;
}
.admin-main {
	flex: 999 1 640px;
	min-width: 0;
}
.admin-main .page {
	padding-block: 0;
}
```

- [x] **Step 2: Season form component**

Create `src/lib/components/SeasonForm.svelte`:

```svelte
<script lang="ts">
	import type { FieldErrors, SeasonField } from '#lib/season.ts';

	let {
		values,
		errors = {},
		editable,
		submit
	}: {
		values: Record<SeasonField, string | number>;
		errors?: FieldErrors;
		editable: SeasonField[];
		submit: string;
	} = $props();

	const fields: {
		name: SeasonField;
		label: string;
		type: string;
		hint: string;
		min?: number;
		max?: number;
	}[] = [
		{
			name: 'name',
			label: 'Season name',
			type: 'text',
			hint: 'Shown on every page of the season.'
		},
		{
			name: 'slug',
			label: 'Slug',
			type: 'text',
			hint: 'Used in links: /seasons/<slug>. Leave empty to make it from the name.'
		},
		{ name: 'startDate', label: 'Start date', type: 'date', hint: 'Week 1 starts on this day.' },
		{
			name: 'roundsPerWeek',
			label: 'Rounds per week',
			type: 'number',
			min: 1,
			max: 4,
			hint: 'A 12-player group plays 11 rounds, about 6 weeks at 2 a week.'
		},
		{
			name: 'deadline',
			label: 'Season deadline',
			type: 'date',
			hint: 'Ends 23:59 Helsinki time. Unplayed matches after this are double losses unless you enter a result.'
		},
		{
			name: 'topCutSize',
			label: 'Top cut per group',
			type: 'number',
			min: 0,
			max: 16,
			hint: 'Marked in standings; the top cut itself comes later.'
		}
	];
</script>

<div class="season-form">
	{#each fields as f (f.name)}
		{@const locked = !editable.includes(f.name)}
		<label class="pb-field">
			{f.label}
			<input
				class="pb-input"
				name={f.name}
				type={f.type}
				min={f.min}
				max={f.max}
				value={values[f.name]}
				disabled={locked}
				required={f.name !== 'slug'}
			/>
			{#if errors[f.name]}
				<span class="pb-hint is-error">{errors[f.name]}</span>
			{:else}
				<span class="pb-hint">{locked ? 'Locked at this stage of the season.' : f.hint}</span>
			{/if}
		</label>
	{/each}
	{#if editable.length}
		<div class="foot"><button class="pb-btn pb-btn-primary">{submit}</button></div>
	{/if}
</div>

<style>
	.season-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 20px;
	}
	.foot {
		grid-column: 1 / -1;
		border-top: 1px solid var(--line);
		padding-top: 20px;
	}
</style>
```

- [x] **Step 3: Confirm button (design's ConfirmDialog)**

Create `src/lib/components/ConfirmButton.svelte`:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		action,
		label,
		title,
		confirmLabel,
		variant = 'primary',
		small = false,
		fields = {},
		children
	}: {
		action: string;
		label: string;
		title: string;
		confirmLabel: string;
		variant?: 'primary' | 'secondary' | 'ghost';
		small?: boolean;
		fields?: Record<string, string>;
		children?: Snippet;
	} = $props();

	const id = $props.id();
	let dialog = $state<HTMLDialogElement>();
</script>

<button
	type="button"
	class={['pb-btn', `pb-btn-${variant}`, small && 'pb-btn-sm']}
	onclick={() => dialog?.showModal()}>{label}</button
>

<dialog bind:this={dialog} class="pb-dialog" aria-labelledby="{id}-title">
	<form method="POST" {action}>
		{#each Object.entries(fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<h2 id="{id}-title" class="pb-dialog-title">{title}</h2>
		<div class="pb-dialog-body">{@render children?.()}</div>
		<div class="pb-dialog-actions">
			<button type="button" class="pb-btn pb-btn-secondary" onclick={() => dialog?.close()}
				>Cancel</button
			>
			<button class="pb-btn pb-btn-primary">{confirmLabel}</button>
		</div>
	</form>
</dialog>

<style>
	/* .pb-dialog sets display:flex, which would override the browser hiding a closed <dialog>. */
	dialog:not([open]) {
		display: none;
	}
	dialog {
		margin: auto;
	}
	dialog::backdrop {
		background: rgba(5, 8, 12, 0.72);
	}
	form {
		display: contents;
	}
</style>
```

- [x] **Step 4: Verify**

Run: `npm run check`
Expected: 0 errors.

- [x] **Step 5: Commit**

```sh
git add src/app.css src/lib/components/SeasonForm.svelte src/lib/components/ConfirmButton.svelte
git commit -m "feat(ui): page/admin styles, season form, confirm button"
```

---

### Task 6: Create seasons (`/admin`)

**Files:**

- Create: `src/routes/admin/+page.server.ts`, `src/routes/admin/+page.svelte`

- [x] **Step 1: Server**

Create `src/routes/admin/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { editableFields, NEW_SEASON, parseSeasonForm } from '#lib/season.ts';
import { organizerAction, organizerPage } from '#lib/server/auth.ts';
import { allSeasons, createSeason, slugTaken } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	organizerPage(event);
	return { seasons: allSeasons() };
};

export const actions: Actions = {
	create: async (event) => {
		await organizerAction(event);
		const form = await event.request.formData();
		const parsed = parseSeasonForm(form, NEW_SEASON, editableFields('draft'));
		if (!parsed.ok) return fail(400, { errors: parsed.errors, raw: parsed.raw });
		if (slugTaken(parsed.values.slug))
			return fail(400, {
				errors: { slug: 'Another season already uses this slug.' },
				raw: {
					...parsed.values,
					roundsPerWeek: String(parsed.values.roundsPerWeek),
					topCutSize: String(parsed.values.topCutSize)
				}
			});
		createSeason(parsed.values);
		redirect(303, `/seasons/${parsed.values.slug}/admin`);
	}
};
```

- [x] **Step 2: Page**

Create `src/routes/admin/+page.svelte`:

```svelte
<script lang="ts">
	import SeasonForm from '#lib/components/SeasonForm.svelte';
	import { editableFields, NEW_SEASON, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Admin · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">Organizer</span>
	<h1>Seasons</h1>

	{#if data.seasons.length}
		<ul class="player-list">
			{#each data.seasons as s (s.id)}
				<li>
					<a class="grow" href="/seasons/{s.slug}/admin">{s.name}</a>
					<span class="pb-badge">{STATUS_LABEL[s.status]}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">No seasons yet.</p>
	{/if}

	<h2>New season</h2>
	<p class="muted">
		It starts as a draft that only organizers can see. Open signup when you're ready.
	</p>
	<form method="POST" action="?/create" class="panel">
		<SeasonForm
			values={form?.raw ?? NEW_SEASON}
			errors={form?.errors}
			editable={editableFields('draft')}
			submit="Create season"
		/>
	</form>
</div>
```

- [x] **Step 3: Verify**

Run: `npm run check`
Expected: 0 errors.

Open http://localhost:5173/admin as an organizer. Submit an empty name → inline error, other values kept. Submit `Test Season`, start/deadline dates → redirect to `/seasons/test-season/admin` (404 until Task 7 — expected).

- [x] **Step 4: Commit**

```sh
git add src/routes/admin
git commit -m "feat(admin): season list and create"
```

---

### Task 7: Season admin — settings, open and close signup

**Files:**

- Create: `src/routes/seasons/[slug]/admin/+layout.server.ts`, `+layout.svelte`, `+page.server.ts`, `+page.svelte`

- [x] **Step 1: Guard + season for all admin pages**

Create `src/routes/seasons/[slug]/admin/+layout.server.ts`:

```ts
import { organizerPage } from '#lib/server/auth.ts';
import { getSeason } from '#lib/server/seasons.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	organizerPage(event);
	return { season: getSeason(event.params.slug, event.locals.user) };
};
```

Create `src/routes/seasons/[slug]/admin/+layout.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const base = $derived(`/seasons/${data.season.slug}/admin`);
	const links = $derived([
		{ href: base, label: 'Season' },
		{ href: `${base}/players`, label: 'Players' },
		{ href: `${base}/groups`, label: 'Groups' }
	]);
</script>

<div class="admin">
	<nav aria-label="Admin" class="admin-nav">
		<span class="eyebrow">{data.season.name}</span>
		{#each links as l (l.href)}
			<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a
			>
		{/each}
		<a href="/seasons/{data.season.slug}">Public page ↗</a>
		<a href="/admin">All seasons</a>
	</nav>
	<div class="admin-main">{@render children()}</div>
</div>
```

- [x] **Step 2: Actions**

Create `src/routes/seasons/[slug]/admin/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { editableFields, parseSeasonForm, seasonFields } from '#lib/season.ts';
import { organizerAction } from '#lib/server/auth.ts';
import { drawGroups, getSeason, setStatus, slugTaken, updateSeason } from '#lib/server/seasons.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	save: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		const parsed = parseSeasonForm(
			await event.request.formData(),
			seasonFields(season),
			editableFields(season.status)
		);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, raw: parsed.raw });
		if (slugTaken(parsed.values.slug, season.id))
			return fail(400, { errors: { slug: 'Another season already uses this slug.' }, raw: null });
		updateSeason(season.id, parsed.values);
		if (parsed.values.slug !== season.slug) redirect(303, `/seasons/${parsed.values.slug}/admin`);
		return { saved: true };
	},

	openSignup: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'draft') return fail(409, { message: 'Signup was already opened.' });
		setStatus(season.id, 'signup');
		return { message: 'Signup is open. The season page is now public.' };
	},

	closeSignup: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup') return fail(409, { message: 'Signup is not open.' });
		setStatus(season.id, 'groups');
		drawGroups(season.id);
		redirect(303, `/seasons/${season.slug}/admin/groups`);
	}
};
```

- [x] **Step 3: Page**

Create `src/routes/seasons/[slug]/admin/+page.svelte`:

```svelte
<script lang="ts">
	import SeasonForm from '#lib/components/SeasonForm.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { editableFields, seasonFields, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
</script>

<svelte:head>
	<title>{season.name} · Admin · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow"
		>{STATUS_LABEL[season.status]}{season.status === 'draft'
			? ' · only organizers can see it'
			: ''}</span
	>
	<h1>{season.name}</h1>

	{#if form && 'message' in form && form.message}
		<p class="status" role="status">{form.message}</p>
	{:else if form && 'saved' in form}
		<p class="status" role="status">Saved.</p>
	{/if}

	{#if season.status === 'draft'}
		<ConfirmButton
			action="?/openSignup"
			label="Open signup"
			title="Open signup for {season.name}?"
			confirmLabel="Open signup"
		>
			The season goes public and anyone in the Porobound Discord can sign up until you close signup.
			You can still edit the dates and top cut until groups are locked.
		</ConfirmButton>
	{:else if season.status === 'signup'}
		<ConfirmButton
			action="?/closeSignup"
			label="Close signup & draw groups"
			title="Close signup and draw the groups?"
			confirmLabel="Close signup"
		>
			Players can no longer sign up or withdraw. Groups are drawn at random; you can adjust them
			before locking.
		</ConfirmButton>
	{/if}

	<form method="POST" action="?/save" class="panel">
		<SeasonForm
			values={form && 'raw' in form && form.raw ? form.raw : seasonFields(season)}
			errors={form && 'errors' in form ? form.errors : undefined}
			editable={editableFields(season.status)}
			submit="Save changes"
		/>
	</form>
</div>
```

- [x] **Step 4: Verify**

Run: `npm run check`
Expected: 0 errors.

Open `/seasons/test-season/admin`: sidebar (Season, Players, Groups), draft eyebrow, "Open signup", editable form. Change the name → "Saved.". Click "Open signup", confirm → status message; slug field now locked.

- [x] **Step 5: Commit**

```sh
git add "src/routes/seasons/[slug]/admin"
git commit -m "feat(admin): season settings, open and close signup"
```

---

### Task 8: Public season page, signup and home routing

**Files:**

- Create: `src/routes/seasons/[slug]/+page.server.ts`, `src/routes/seasons/[slug]/+page.svelte`
- Modify: `src/routes/+page.server.ts`, `src/routes/+page.svelte`

- [x] **Step 1: Season page server**

Create `src/routes/seasons/[slug]/+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import { playerAction } from '#lib/server/auth.ts';
import { addEntry, getSeason, groupsOf, removeEntry, seasonEntries } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const season = getSeason(params.slug, locals.user);
	const list = seasonEntries(season.id);
	return {
		season,
		entries: list,
		groups: season.status === 'play' || season.status === 'finished' ? groupsOf(list) : [],
		signedUp: !!locals.user && list.some((e) => e.playerId === locals.user!.id)
	};
};

export const actions: Actions = {
	join: async (event) => {
		const user = playerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup') return fail(409, { message: 'Signup is closed.' });
		addEntry(season.id, user.id);
		return { message: "You're in. See you in the groups." };
	},

	withdraw: async (event) => {
		const user = playerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup')
			return fail(409, {
				message: 'Signup is closed, so you can no longer withdraw. Ask an organizer.'
			});
		removeEntry(season.id, user.id);
		return { message: `You withdrew from ${season.name}.` };
	}
};
```

- [x] **Step 2: Season page**

Create `src/routes/seasons/[slug]/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { groupName, STATUS_LABEL } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const season = $derived(data.season);
	const user = $derived(data.user);
	const date = (d: string | null) =>
		d
			? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				})
			: '';
</script>

<svelte:head>
	<title>{season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{STATUS_LABEL[season.status]}</span>
	<h1>{season.name}</h1>
	<p class="muted">
		Starts {date(season.startDate)} · season deadline {date(season.deadline)}, 23:59 Helsinki time ·
		{season.roundsPerWeek} rounds a week
	</p>

	{#if form?.message}
		<p class="status" role="status">{form.message}</p>
	{/if}

	{#if season.status === 'draft'}
		<p class="status">
			Draft: only organizers can see this page. <a href="/seasons/{season.slug}/admin">Open admin</a
			>
		</p>
	{:else if season.status === 'signup'}
		<section class="panel signup">
			<span class="eyebrow">Signed up so far</span>
			<span class="count">{data.entries.length}</span>
			<p class="muted">
				Open to everyone in the Porobound Discord until an organizer closes signup. 16 or more
				players makes two groups.
			</p>
			{#if !user}
				<a
					class="pb-btn pb-btn-primary"
					href="/auth/login?returnTo={encodeURIComponent(page.url.pathname)}"
					data-sveltekit-reload>Log in with Discord to sign up</a
				>
			{:else if data.signedUp}
				<p>
					<span class="pb-badge pb-badge-win">You're in</span> Signed up as
					<strong>{user.displayName}</strong>. You can withdraw until signup closes.
				</p>
				<ConfirmButton
					action="?/withdraw"
					variant="secondary"
					label="Withdraw"
					title="Withdraw from {season.name}?"
					confirmLabel="Withdraw"
				>
					You'll be taken off the signup list. You can sign up again while signup is open.
				</ConfirmButton>
			{:else}
				<p>You'll play as <strong>{user.displayName}</strong>, your nickname on the server.</p>
				<form method="POST" action="?/join">
					<button class="pb-btn pb-btn-primary">Sign up for {season.name}</button>
				</form>
			{/if}
		</section>
	{:else if season.status === 'groups'}
		<p class="status">Signup is closed. Groups are being drawn; the schedule follows shortly.</p>
	{/if}

	{#if data.groups.length}
		<div class="grid-2">
			{#each data.groups as group, i (i)}
				<section class="panel">
					<h2>{groupName(i + 1)}</h2>
					<ul class="player-list">
						{#each group as e (e.playerId)}
							<li>
								<Avatar name={e.displayName} src={e.avatar} />
								<span class="grow">{e.displayName}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{:else if data.entries.length}
		<section>
			<h2>Players</h2>
			<ul class="player-list">
				{#each data.entries as e (e.playerId)}
					<li>
						<Avatar name={e.displayName} src={e.avatar} /> <span class="grow">{e.displayName}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.signup {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		max-width: 480px;
	}
	.signup p {
		margin: 0;
	}
	.count {
		font: 500 40px/44px var(--font-mono);
	}
</style>
```

- [x] **Step 3: Home routing**

Replace `src/routes/+page.server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import { latestSeason } from '#lib/server/seasons.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const live = latestSeason('not-draft');
	if (live && live.status !== 'finished') redirect(307, `/seasons/${live.slug}`);
	if (latestSeason('draft')) return { comingSoon: true };
	if (live) redirect(307, `/seasons/${live.slug}`);
	return { comingSoon: false };
};
```

Replace `src/routes/+page.svelte`:

```svelte
<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Poroleague</title>
</svelte:head>

<section class="hero">
	{#if data.comingSoon}
		<span class="pb-badge">Coming soon</span>
		<h1>The next season is on its way.</h1>
		<p>It's being set up now. Signup will be announced in the Porobound Discord.</p>
	{:else}
		<span class="pb-badge">No season yet</span>
		<h1>The herd is gathering.</h1>
		<p>The first season hasn't been set up yet. It will be announced in the Porobound Discord.</p>
	{/if}
	{#if data.user?.isOrganizer}
		<a class="pb-btn pb-btn-secondary" href="/admin">Go to admin</a>
	{/if}
</section>

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

- [x] **Step 4: Verify**

Run: `npm run check`
Expected: 0 errors.

With `test-season` in signup: `/` redirects to `/seasons/test-season`; "Sign up" → "You're in", count 1, your name in the list; "Withdraw" (confirm) → count 0. Logged out: login button with return to the season page. Create a second season (draft): logged out, `/seasons/<draft-slug>` → 404.

- [x] **Step 5: Commit**

```sh
git add "src/routes/seasons/[slug]/+page.server.ts" "src/routes/seasons/[slug]/+page.svelte" src/routes/+page.server.ts src/routes/+page.svelte
git commit -m "feat(season): public season page, signup and withdraw, home routing"
```

---

### Task 9: Admin players and groups

**Files:**

- Create: `src/routes/seasons/[slug]/admin/players/+page.server.ts`, `+page.svelte`
- Create: `src/routes/seasons/[slug]/admin/groups/+page.server.ts`, `+page.svelte`

- [x] **Step 1: Players server**

Create `src/routes/seasons/[slug]/admin/players/+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import { organizerAction } from '#lib/server/auth.ts';
import { getSeason, removeEntry, seasonEntries } from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	return { entries: seasonEntries(season.id) };
};

export const actions: Actions = {
	remove: async (event) => {
		const user = await organizerAction(event);
		const season = getSeason(event.params.slug, user);
		if (season.status !== 'signup')
			return fail(409, { message: 'Players can only be removed while signup is open.' });
		const playerId = String((await event.request.formData()).get('playerId'));
		removeEntry(season.id, playerId);
		return { message: 'Removed from signups.' };
	}
};
```

- [x] **Step 2: Players page**

Create `src/routes/seasons/[slug]/admin/players/+page.svelte`:

```svelte
<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const canRemove = $derived(data.season.status === 'signup');
</script>

<svelte:head>
	<title>Players · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<span class="eyebrow">{data.entries.length} signed up</span>
	<h1>Players</h1>
	<p class="muted">
		{canRemove
			? 'Everyone who signed up. You can remove someone while signup is open; 16 or more players makes two groups.'
			: 'Signup is closed. Dropping players comes with the in-season admin tools.'}
	</p>

	{#if form?.message}
		<p class="status" role="status">{form.message}</p>
	{/if}

	<ul class="player-list">
		{#each data.entries as e (e.playerId)}
			<li>
				<Avatar name={e.displayName} src={e.avatar} />
				<span class="grow">{e.displayName}</span>
				{#if canRemove}
					<ConfirmButton
						action="?/remove"
						variant="ghost"
						small
						fields={{ playerId: e.playerId }}
						label="Remove"
						title="Remove {e.displayName} from signups?"
						confirmLabel="Remove"
					>
						They can sign up again while signup is open.
					</ConfirmButton>
				{/if}
			</li>
		{:else}
			<li class="muted">Nobody has signed up yet.</li>
		{/each}
	</ul>
</div>
```

- [x] **Step 3: Groups server**

Create `src/routes/seasons/[slug]/admin/groups/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { organizerAction } from '#lib/server/auth.ts';
import {
	drawGroups,
	getSeason,
	groupsOf,
	lockGroups,
	seasonEntries,
	setGroup
} from '#lib/server/seasons.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { season } = await parent();
	return { groups: groupsOf(seasonEntries(season.id)) };
};

async function inGroupsPhase(event: RequestEvent) {
	const user = await organizerAction(event);
	const season = getSeason(event.params.slug, user);
	return season.status === 'groups' ? season : null;
}

export const actions: Actions = {
	move: async (event) => {
		const season = await inGroupsPhase(event);
		if (!season) return fail(409, { message: 'Groups are locked.' });
		const form = await event.request.formData();
		const groups = groupsOf(seasonEntries(season.id));
		const from = Number(form.get('group'));
		if (groups.length !== 2 || (from !== 1 && from !== 2))
			return fail(400, { message: 'Nothing to move between.' });
		setGroup(season.id, String(form.get('playerId')), 3 - from);
		return {};
	},

	redraw: async (event) => {
		const season = await inGroupsPhase(event);
		if (!season) return fail(409, { message: 'Groups are locked.' });
		drawGroups(season.id);
		return { message: 'Groups redrawn at random.' };
	},

	lock: async (event) => {
		const season = await inGroupsPhase(event);
		if (!season) return fail(409, { message: 'Groups are already locked.' });
		const groups = groupsOf(seasonEntries(season.id));
		if (!groups.length || groups.some((g) => g.length < 2))
			return fail(400, { message: 'Every group needs at least 2 players.' });
		lockGroups(season.id);
		redirect(303, `/seasons/${season.slug}/admin/groups`);
	}
};
```

- [x] **Step 4: Groups page**

Create `src/routes/seasons/[slug]/admin/groups/+page.svelte`:

```svelte
<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { groupName } from '#lib/season.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const status = $derived(data.season.status);
	const info = (n: number) =>
		`${n} players · ${n % 2 ? `${n} rounds, 1 bye per round` : `${n - 1} rounds`}`;
</script>

<svelte:head>
	<title>Groups · {data.season.name} · Poroleague</title>
</svelte:head>

<div class="page">
	<h1>{status === 'groups' ? 'Group draw preview' : 'Groups'}</h1>

	{#if form?.message}
		<p class="status" role="status">{form.message}</p>
	{/if}

	{#if status === 'draft' || status === 'signup'}
		<p class="muted">Groups are drawn at random when you close signup.</p>
	{:else}
		{#if status === 'groups'}
			<p class="muted">
				Groups were drawn at random. Move players if needed, then lock. Locking generates the
				round-robin schedule and can't be undone.
			</p>
			<div class="actions">
				<ConfirmButton
					action="?/redraw"
					variant="secondary"
					label="Redraw at random"
					title="Redraw the groups?"
					confirmLabel="Redraw"
				>
					Everyone is drawn into groups at random again. Moves you made are lost.
				</ConfirmButton>
				<ConfirmButton
					action="?/lock"
					label="Lock groups & generate schedule"
					title="Lock groups and generate the schedule?"
					confirmLabel="Lock groups"
				>
					You can't move players between groups after this. Dropping a player later voids their
					matches instead.
				</ConfirmButton>
			</div>
		{:else}
			<p class="status" role="status">Groups are locked and the schedule is ready.</p>
		{/if}

		<div class="grid-2">
			{#each data.groups as group, i (i)}
				<section class="panel">
					<h2>{groupName(i + 1)}</h2>
					<p class="muted">{info(group.length)}</p>
					<ul class="player-list">
						{#each group as e (e.playerId)}
							<li>
								<Avatar name={e.displayName} src={e.avatar} />
								<span class="grow">{e.displayName}</span>
								{#if status === 'groups' && data.groups.length === 2}
									<form method="POST" action="?/move">
										<input type="hidden" name="playerId" value={e.playerId} />
										<input type="hidden" name="group" value={i + 1} />
										<button class="pb-btn pb-btn-ghost pb-btn-sm"
											>Move to {groupName(2 - i).slice(-1)}</button
										>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</div>
```

- [x] **Step 5: Verify**

Run: `npm run check`
Expected: 0 errors.

- [x] **Step 6: Commit**

```sh
git add "src/routes/seasons/[slug]/admin/players" "src/routes/seasons/[slug]/admin/groups"
git commit -m "feat(admin): players list, group draw preview, move, redraw, lock"
```

---

### Task 10: Dev seed script, end-to-end check, docs, PR

**Files:**

- Create: `scripts/seed-dev.ts`
- Modify: `package.json`, `docs/spec.md`

- [ ] **Step 1: Seed script**

Create `scripts/seed-dev.ts`:

```ts
// Dev only: signs up N fake players to a season so group draws can be tested with one real account.
import Database from 'better-sqlite3';

process.loadEnvFile();
const [slug, count = '24'] = process.argv.slice(2);
if (!slug) throw new Error('usage: npm run db:seed-dev -- <season-slug> [count]');

const db = new Database(process.env.DATABASE_URL!);
const season = db.prepare('select id from seasons where slug = ?').get(slug) as
	{ id: number } | undefined;
if (!season) throw new Error(`No season with slug "${slug}"`);

const addPlayer = db.prepare('insert or ignore into players (id, display_name) values (?, ?)');
const addEntry = db.prepare('insert or ignore into entries (season_id, player_id) values (?, ?)');
for (let i = 1; i <= Number(count); i++) {
	addPlayer.run(`dev-${i}`, `Dev Player ${i}`);
	addEntry.run(season.id, `dev-${i}`);
}
console.log(`Signed up ${count} dev players to ${slug}.`);
```

In `package.json` `scripts`, add after `"db:studio"`:

```json
"db:seed-dev": "node scripts/seed-dev.ts"
```

- [ ] **Step 2: End-to-end (organizer account, dev server running)**

1. `/admin` → create `Test Season` (start next Monday, deadline 6 weeks later) → lands on its admin page.
2. Open signup → `/` redirects to `/seasons/test-season`; sign up yourself.
3. Run `npm run db:seed-dev -- test-season 23` → page shows 24 signed up.
4. Admin → Players: remove `Dev Player 23` → 23 left.
5. Season page → "Close signup & draw groups" → Groups page: two groups (12 + 11), info lines right ("11 players · 11 rounds, 1 bye per round").
6. Move one player → counts change. Redraw → reshuffled.
7. Lock → "Groups are locked". Check: `sqlite3 local.db "select group_no, count(*), max(round) from matches group by group_no;"` → two rows whose counts are n(n−1)/2 for each group size and max round n−1 (even) or n (odd).
8. Season page (public) shows both groups with members. Season admin form: only name and deadline editable.
9. Organizer re-check: in Discord temporarily remove your organizer role, try "Save changes" → `/login/not-organizer`; restore the role and log in again.

- [ ] **Step 3: Spec**

In `docs/spec.md`, replace the `/` line under `## Pages` with:

```markdown
- `/` — the newest non-draft season if it's still running (redirect); else "next season coming soon" if a draft exists; else the newest finished season; no seasons → empty state
- `/admin` — organizers: season list, create season
```

In `## Organizer powers`, change the Signup row to `Open/close signup (closing draws the groups), remove signup` and the Groups row to `Redraw, move player between groups, lock (generates schedule)`.

- [ ] **Step 4: Full verification**

Run: `npm run check && npx vitest run && npm run build && npx prettier --check .`
Expected: 0 errors; 7 test files, 30 tests; build succeeds; prettier clean.

- [ ] **Step 5: Commit, push, PR (ask first)**

```sh
git add scripts/seed-dev.ts package.json docs/spec.md docs/superpowers/plans/2026-10-22-season-signup.md
git commit -m "chore: dev seed script; spec for home routing and admin"
git push -u origin plan-3-season-signup
gh pr create --title "Plan 3: Season & signup" --body "Closes #3"
```
