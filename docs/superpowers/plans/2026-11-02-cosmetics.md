# Profile Cosmetics Implementation Plan (#143)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players equip one title, one badge and one avatar frame from achievements they've earned. The frame, badge and title show on the career page and the per-season player page. Only the badge shows in standings and the top-cut bracket. Everything else stays a plain name.

**Architecture:** The rules are pure, in `src/lib/league/cosmetics.ts`: which achievement may go in which slot (`canEquip`), what a page draws for an equipped set (`look`), and the Customize options (`choices`). `players` gets three nullable achievement-id columns. `src/lib/server/cosmetics.ts` checks ownership against #142's `player_achievements` and saves all three slots at once. `seasonEntries` selects the columns, so the standings, top-cut and player pages call `look()` on rows they already load. The badge is the DS flair chip (`.pb-flair`) holding the achievement's own icon. The frame is the DS rank ring (`.pb-framed` + `.pb-ring` SVG), ported into `Avatar.svelte`.

**Tech Stack:** SvelteKit 3 (adapter-node), Svelte 5.57, Drizzle + better-sqlite3, Vitest, Playwright. No new dependencies.

**Stack position:** #141 holiday → #142 achievements → **#143 cosmetics** → #144 API. Migration **0009**. Branch `feat/143-cosmetics`, in a scratchpad worktree (never switch the main checkout). PR title `feat(cosmetics): titles, badges and avatar frames from achievements`, body `Closes #143`.

---

## Decisions this plan locks in

- **Model:** `players.title_achievement`, `badge_achievement`, `frame_achievement` hold nullable achievement ids. There's no FK, because ids are code (`ACHIEVEMENTS`).
- **Validation (server, one place, `equip`):** the request saves all three slots together. Each slot is either `null` (cleared) or a known id the player owns (has a `player_achievements` row). A frame also needs a tier. If any slot fails, nothing is saved.
- **Who:** only the owner, through `playerAction` plus `user.id === params.id`. This isn't organizer work, so no `organizerAction`. Anyone else gets `fail(403)`, and logged-out users go to login. There's no audit row.
- **Display:** `look()` maps ids to what pages draw. An unknown id (say, a renamed legend) draws nothing. A title gets its achievement's tier colour, or accent for one-offs.
- **Badge = icon** (the issue wins over the design's text "flair" pills): an icon-only `.pb-flair` chip with the achievement's icon, `role="img"`, named "`<name>` badge". It's the same chip on desktop and at 390 px, where the design is icon-only anyway.
- **Pickers = three `<select>`s** (issue), not the design's radio chips: an unlock-all player has 187 options. Frame options are tiered achievements labelled `Gold · Ahri Master`, best tier first. The panel is a `<details>` disclosure ("Customize profile"), so it works without JS. The live preview reads the selects' bound state.
- **Where:** career and season player page headers show frame, badge and title. The season standings table (`StandingsTable`, used only on `/seasons/[slug]`) and the top-cut page (desktop bracket boxes and phone cards) show the badge only. Schedule, match, audit, admin and Discord show plain names: the API's `playerRef` picks fields explicitly and Discord embeds use `displayName`, so neither changes here.
- **Erasure clears cosmetics.** A former player shows a plain name, and Avatar ignores `frame` when `former`.
- **Login keeps cosmetics:** the OAuth upsert only sets `displayName` and `avatar`. A regression test pins this.
- **Dev:** `db:achievements-dev … none` also clears the three slots, so the "never revoked" invariant holds in dev too.

## File structure

| File                                                                                                                   | Responsibility                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/league/cosmetics.ts` (create)                                                                                 | `SLOTS`, `Slot`, `Picks`, `Equipped`, `NOTHING`, `picks`, `canEquip`, `Badge`, `Look`, `look`, `Option`, `Choices`, `choices` |
| `src/lib/league/cosmetics.spec.ts` (create)                                                                            | pure rules                                                                                                                    |
| `src/lib/server/db/schema.ts`, `drizzle/0009_*` (modify/generate)                                                      | three columns                                                                                                                 |
| `src/lib/server/seasons.ts` (modify)                                                                                   | `seasonEntries` selects the columns; `groupStandings` rows get `badge`                                                        |
| `src/lib/server/players.ts` (modify)                                                                                   | `erasePlayer` clears the slots                                                                                                |
| `src/lib/server/cosmetics.ts` (create)                                                                                 | `ownedAchievements`, `equip`                                                                                                  |
| `src/lib/server/cosmetics.spec.ts` (create)                                                                            | equip, action, loads, standings and top-cut badges                                                                            |
| `src/lib/matchCard.ts` (modify)                                                                                        | `withBadges` (top cut only)                                                                                                   |
| `src/lib/components/Avatar.svelte` (modify)                                                                            | `frame` prop, DS ring                                                                                                         |
| `src/lib/components/Flair.svelte` (create)                                                                             | badge chip                                                                                                                    |
| `src/lib/components/PlayerName.svelte`, `MatchCard.svelte`, `StandingsTable.svelte` (modify)                           | `badge`                                                                                                                       |
| `src/lib/components/Customize.svelte` (create)                                                                         | owner's form + live preview                                                                                                   |
| `src/app.css` (modify)                                                                                                 | `.cos-title`, badge icon fit, Customize panel                                                                                 |
| `src/routes/players/[id]/+page.server.ts`, `+page.svelte` (modify)                                                     | cosmetics, Customize, `customize` action                                                                                      |
| `src/routes/seasons/[slug]/players/[id]/+page.server.ts`, `+page.svelte` (modify)                                      | header cosmetics                                                                                                              |
| `src/routes/seasons/[slug]/+page.svelte` (via StandingsTable)                                                          | badge in standings                                                                                                            |
| `src/routes/seasons/[slug]/top-cut/+page.server.ts`, `+page.svelte` (modify)                                           | badge in bracket and cards                                                                                                    |
| `e2e/db.ts`, `e2e/fixtures.ts`, `e2e/cosmetics.spec.ts` (create), `e2e/top-cut.spec.ts`, `e2e/mobile.spec.ts` (modify) | e2e                                                                                                                           |
| `scripts/reseed-dev.ts`, `scripts/achievements-dev.ts`, `README.md` (modify)                                           | dev data                                                                                                                      |
| `docs/spec.md`, `docs/erasure.md` (modify)                                                                             | docs                                                                                                                          |

---

### Task 1: Prerequisite check (#141 and #142 landed)

- [ ] **Step 1: Rebase on `main` once #142 is merged, then check**

```bash
grep -n "pb-framed\|pb-ring\|pb-flair-icon\|tier-gold" src/lib/styles/porobound.css | head
grep -n "export const ACHIEVEMENTS\|export const achievementById\|export type Tier\|export type Achievement" src/lib/league/achievements.ts
grep -n "playerAchievements" src/lib/server/db/schema.ts src/lib/server/test/setup.ts
ls drizzle/0008_*.sql
grep -n "tag" src/lib/components/PlayerName.svelte src/lib/components/MatchCard.svelte
grep -n "seedAchievements" e2e/db.ts
```

Expected: every grep hits. 0008 exists. `PlayerName` and `MatchCard` have #141's `tag`. `e2e/db.ts` has #142's `seedAchievements`. If the DS classes are missing, stop and ask; don't hand-edit the snapshot. There's nothing to commit.

---

### Task 2: Pure cosmetics rules

**Files:**

- Create: `src/lib/league/cosmetics.ts`
- Test: `src/lib/league/cosmetics.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';
import { canEquip, choices, look, NOTHING, picks } from '#lib/league/cosmetics.ts';

const owned = new Set([
	'first-blood',
	'legend-ahri-master',
	'dice-player',
	'legend-renamed-player'
]);

describe('canEquip', () => {
	it('allows only owned, known achievements; frames need a tier', () => {
		expect(canEquip('title', 'first-blood', owned)).toBe(true);
		expect(canEquip('badge', 'legend-ahri-master', owned)).toBe(true);
		expect(canEquip('frame', 'legend-ahri-master', owned)).toBe(true);
		expect(canEquip('frame', 'first-blood', owned)).toBe(false); // one-off: no tier
		expect(canEquip('title', 'champion', owned)).toBe(false); // not owned
		expect(canEquip('badge', 'legend-renamed-player', owned)).toBe(false); // unknown id
	});

	it('always allows clearing a slot', () => {
		for (const slot of ['title', 'badge', 'frame'] as const)
			expect(canEquip(slot, null, new Set())).toBe(true);
	});
});

describe('look', () => {
	it('draws nothing when nothing is equipped', () => {
		expect(look(NOTHING)).toEqual({ title: null, badge: null, frame: null });
	});

	it('maps ids to the title text, badge icon and frame tier', () => {
		expect(
			look({
				titleAchievement: 'legend-ahri-master',
				badgeAchievement: 'first-blood',
				frameAchievement: 'dice-player'
			})
		).toEqual({
			title: { text: 'Ahri Master', tier: 'gold' },
			badge: { name: 'First Blood', icon: '/achievements/items/first-blood.png', tier: null },
			frame: 'bronze'
		});
	});

	it('draws nothing for an id no longer in the list', () => {
		expect(
			look({ titleAchievement: 'gone', badgeAchievement: 'gone', frameAchievement: 'gone' })
		).toEqual({ title: null, badge: null, frame: null });
	});

	it('reads the columns back as form picks', () => {
		expect(picks({ ...NOTHING, badgeAchievement: 'first-blood' })).toEqual({
			title: null,
			badge: 'first-blood',
			frame: null
		});
	});
});

describe('choices', () => {
	it('offers only earned achievements, in list order; frames best tier first', () => {
		const c = choices(owned);
		expect(c.titles.map((o) => o.id)).toEqual(
			ACHIEVEMENTS.filter((a) => owned.has(a.id)).map((a) => a.id)
		);
		expect(c.badges.find((o) => o.id === 'first-blood')).toEqual({
			id: 'first-blood',
			label: 'First Blood',
			tier: null,
			icon: '/achievements/items/first-blood.png'
		});
		expect(c.frames.map((o) => o.label)).toEqual(['Gold · Ahri Master', 'Bronze · Dice Player']);
	});

	it('is empty for a player with nothing earned', () => {
		expect(choices(new Set())).toEqual({ titles: [], badges: [], frames: [] });
	});
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/league/cosmetics.spec.ts`
Expected: FAIL, cannot resolve `#lib/league/cosmetics.ts`.

- [ ] **Step 3: Implement** `src/lib/league/cosmetics.ts`

```ts
import {
	ACHIEVEMENTS,
	achievementById,
	type Achievement,
	type Tier
} from '#lib/league/achievements.ts';

// Profile cosmetics: each slot holds the id of an achievement the player earned. Earned rows are
// never removed, so an equipped item stays valid.
export const SLOTS = ['title', 'badge', 'frame'] as const;
export type Slot = (typeof SLOTS)[number];
export type Picks = Record<Slot, string | null>;
// The players columns, as seasonEntries selects them.
export type Equipped = {
	titleAchievement: string | null;
	badgeAchievement: string | null;
	frameAchievement: string | null;
};
export const NOTHING: Equipped = {
	titleAchievement: null,
	badgeAchievement: null,
	frameAchievement: null
};

export const picks = (e: Equipped): Picks => ({
	title: e.titleAchievement,
	badge: e.badgeAchievement,
	frame: e.frameAchievement
});

// null clears the slot. Otherwise the player must own a known achievement; a frame needs a tier.
export function canEquip(slot: Slot, id: string | null, owned: ReadonlySet<string>) {
	if (id === null) return true;
	const a = achievementById.get(id);
	return !!a && owned.has(id) && (slot !== 'frame' || a.tier !== null);
}

export type Badge = { name: string; icon: string; tier: Tier | null };
export type Look = {
	title: { text: string; tier: Tier | null } | null;
	badge: Badge | null;
	frame: Tier | null;
};

// What pages draw. An id no longer in the list (a renamed legend) draws nothing.
export function look(e: Equipped): Look {
	const get = (id: string | null) => (id ? achievementById.get(id) : undefined);
	const [t, b, f] = [get(e.titleAchievement), get(e.badgeAchievement), get(e.frameAchievement)];
	return {
		title: t ? { text: t.title, tier: t.tier } : null,
		badge: b ? { name: b.name, icon: b.icon, tier: b.tier } : null,
		frame: f?.tier ?? null
	};
}

export type Option = { id: string; label: string; tier: Tier | null; icon: string };
export type Choices = Record<'titles' | 'badges' | 'frames', Option[]>;
const TIER_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;
const RANK = { gold: 0, silver: 1, bronze: 2 } as const;

// The Customize selects: only what the player earned, in list order; frames best tier first.
export function choices(owned: ReadonlySet<string>): Choices {
	const mine = ACHIEVEMENTS.filter((a) => owned.has(a.id));
	const opt = (a: Achievement, label: string): Option => ({
		id: a.id,
		label,
		tier: a.tier,
		icon: a.icon
	});
	return {
		titles: mine.map((a) => opt(a, a.title)),
		badges: mine.map((a) => opt(a, a.name)),
		frames: mine
			.filter((a) => a.tier)
			.sort((x, y) => RANK[x.tier!] - RANK[y.tier!])
			.map((a) => opt(a, `${TIER_NAME[a.tier!]} · ${a.name}`))
	};
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/league/cosmetics.spec.ts && npm run check`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/league/cosmetics.ts src/lib/league/cosmetics.spec.ts
git commit -m "feat(cosmetics): pure rules for equipping and drawing cosmetics"
```

---

### Task 3: Columns, entries, erasure, login

**Files:**

- Modify: `src/lib/server/db/schema.ts`, `src/lib/server/seasons.ts:137-153`, `src/lib/server/players.ts` (`erasePlayer`)
- Generated: `drizzle/0009_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0009_snapshot.json`
- Test: `src/lib/server/players.spec.ts`, `src/lib/server/auth.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/server/players.spec.ts`, inside `describe('erasePlayer')`, add the following. Use the describe's existing seed. If it doesn't create `p1`, call `seedPlayers(2)` first, as the neighbouring tests do.

```ts
it('clears equipped cosmetics, so a former player shows a plain name', () => {
	db.update(players)
		.set({
			titleAchievement: 'first-blood',
			badgeAchievement: 'first-blood',
			frameAchievement: 'dice-player'
		})
		.where(eq(players.id, 'p1'))
		.run();
	erasePlayer('p1', 'p2');
	expect(db.select().from(players).where(eq(players.id, 'p1')).get()).toMatchObject({
		titleAchievement: null,
		badgeAchievement: null,
		frameAchievement: null
	});
});
```

In `src/lib/server/auth.spec.ts`, inside `describe('OAuth callback')`:

```ts
it('keeps equipped cosmetics when Discord updates the name', async () => {
	db.insert(players)
		.values({
			id: 'abc',
			discordId: '1001',
			displayName: 'Old name',
			titleAchievement: 'first-blood'
		})
		.run();
	discord({ token: token(), member: json(member([])) });
	await call('code=c&state=st', started());
	expect(db.select().from(players).where(eq(players.id, 'abc')).get()).toMatchObject({
		displayName: 'Nick',
		titleAchievement: 'first-blood'
	});
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/server/players.spec.ts src/lib/server/auth.spec.ts`
Expected: FAIL. TypeScript/Drizzle rejects `titleAchievement` (unknown column).

- [ ] **Step 3: Add the columns.** In `schema.ts`, extend `players`:

```ts
export const players = sqliteTable('players', {
	id: text('id').primaryKey(), // random, from newPlayerId(); not the Discord id
	discordId: text('discord_id').unique(), // null once erased
	displayName: text('display_name').notNull(),
	avatar: text('avatar'),
	erasedAt: integer('erased_at', { mode: 'timestamp' }),
	// Equipped cosmetics: ids from src/lib/league/achievements.ts the player earned (#143).
	titleAchievement: text('title_achievement'),
	badgeAchievement: text('badge_achievement'),
	frameAchievement: text('frame_achievement')
});
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: one new `drizzle/0009_*.sql` with three `ALTER TABLE \`players\` ADD \`…_achievement\` text;` lines and nothing else.

- [ ] **Step 5: Select the columns in `seasonEntries`** (`src/lib/server/seasons.ts`), after `former: former(),`:

```ts
			titleAchievement: players.titleAchievement,
			badgeAchievement: players.badgeAchievement,
			frameAchievement: players.frameAchievement,
```

- [ ] **Step 6: Clear them on erasure.** In `erasePlayer`'s `tx.update(players).set({...})`, add `titleAchievement: null, badgeAchievement: null, frameAchievement: null`.

- [ ] **Step 7: Run every test and confirm it passes**

Run: `npx vitest run && npm run check`
Expected: PASS. The OAuth test passes with no code change, because `onConflictDoUpdate` only sets name and avatar. Break it once by adding `titleAchievement: null` to that `set`: the test must fail. Then revert.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle src/lib/server/seasons.ts src/lib/server/players.ts src/lib/server/players.spec.ts src/lib/server/auth.spec.ts
git commit -m "feat(cosmetics): equipped title, badge and frame columns"
```

---

### Task 4: Server equip with ownership check

**Files:**

- Create: `src/lib/server/cosmetics.ts`
- Test: `src/lib/server/cosmetics.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { playerAchievements, players } from '#lib/server/db/schema.ts';
import { equip, ownedAchievements } from '#lib/server/cosmetics.ts';
import { seedPlayers } from '#lib/server/test/seed.ts';

const earn = (playerId: string, ids: string[]) =>
	db
		.insert(playerAchievements)
		.values(
			ids.map((achievementId) => ({
				playerId,
				achievementId,
				unlockedAt: new Date(),
				seasonId: null
			}))
		)
		.run();
const slots = (id: string) => {
	const p = db.select().from(players).where(eq(players.id, id)).get()!;
	return [p.titleAchievement, p.badgeAchievement, p.frameAchievement];
};

describe('equip', () => {
	it('saves owned achievements in all three slots', () => {
		seedPlayers(2);
		earn('p1', ['first-blood', 'legend-ahri-master']);
		expect(ownedAchievements('p1')).toEqual(new Set(['first-blood', 'legend-ahri-master']));
		expect(
			equip('p1', {
				title: 'legend-ahri-master',
				badge: 'first-blood',
				frame: 'legend-ahri-master'
			})
		).toBeNull();
		expect(slots('p1')).toEqual(['legend-ahri-master', 'first-blood', 'legend-ahri-master']);
		expect(slots('p2')).toEqual([null, null, null]);
	});

	it('refuses an achievement the player does not own, saving nothing', () => {
		seedPlayers(2);
		earn('p1', ['first-blood']);
		earn('p2', ['champion']);
		expect(equip('p1', { title: 'first-blood', badge: 'champion', frame: null })).toBe('badge');
		expect(slots('p1')).toEqual([null, null, null]);
	});

	it('refuses a frame without a tier, and unknown ids', () => {
		seedPlayers(1);
		earn('p1', ['first-blood', 'legend-renamed-player']);
		expect(equip('p1', { title: null, badge: null, frame: 'first-blood' })).toBe('frame');
		expect(equip('p1', { title: 'legend-renamed-player', badge: null, frame: null })).toBe('title');
	});

	it('clears a slot', () => {
		seedPlayers(1);
		earn('p1', ['first-blood']);
		equip('p1', { title: 'first-blood', badge: 'first-blood', frame: null });
		expect(equip('p1', { title: null, badge: 'first-blood', frame: null })).toBeNull();
		expect(slots('p1')).toEqual([null, 'first-blood', null]);
	});
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/server/cosmetics.spec.ts`
Expected: FAIL, cannot resolve `#lib/server/cosmetics.ts`.

- [ ] **Step 3: Implement** `src/lib/server/cosmetics.ts`

```ts
import { eq } from 'drizzle-orm';
import { canEquip, SLOTS, type Picks, type Slot } from '#lib/league/cosmetics.ts';
import { db } from '#lib/server/db/index.ts';
import { playerAchievements, players } from '#lib/server/db/schema.ts';

export const ownedAchievements = (playerId: string) =>
	new Set(
		db
			.select({ id: playerAchievements.achievementId })
			.from(playerAchievements)
			.where(eq(playerAchievements.playerId, playerId))
			.all()
			.map((r) => r.id)
	);

// Saves all three slots, or nothing: returns the first slot the player may not fill, else null.
// The caller checks that the player is the one logged in.
export function equip(playerId: string, p: Picks): Slot | null {
	const owned = ownedAchievements(playerId);
	const bad = SLOTS.find((s) => !canEquip(s, p[s], owned));
	if (bad) return bad;
	db.update(players)
		.set({ titleAchievement: p.title, badgeAchievement: p.badge, frameAchievement: p.frame })
		.where(eq(players.id, playerId))
		.run();
	return null;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/server/cosmetics.spec.ts && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/cosmetics.ts src/lib/server/cosmetics.spec.ts
git commit -m "feat(cosmetics): equip with an ownership check"
```

---

### Task 5: Frame, badge and title components

**Files:**

- Modify: `src/lib/components/Avatar.svelte`, `src/lib/components/PlayerName.svelte`, `src/lib/components/MatchCard.svelte`, `src/app.css`
- Create: `src/lib/components/Flair.svelte`

Design reference: DS `Avatar` (`frame`), `Flair` (`iconOnly`), `PlayerName`/`MatchCard` (`flair`) in the Porobound bundle. The CSS (`.pb-framed`, `.pb-ring`, `.pb-frame-*`, `.pb-flair*`) is already in `porobound.css` from #141. Only the markup is ported here.

- [ ] **Step 1: `Avatar.svelte` gets `frame`.** Add `frame = null` to the props (type `frame?: Tier | null`, `import type { Tier } from '#lib/league/achievements.ts';`). Wrap the existing three branches in `{#snippet face()}…{/snippet}`, then render:

```svelte
{#if frame && !former}
	<span
		class="pb-framed pb-frame-{frame}"
		style:padding="{Math.max(3, Math.round(size * 0.14))}px"
		role="img"
		aria-label="{TIER[frame]} frame"
	>
		{@render face()}
		<svg class="pb-ring" viewBox="0 0 100 100" aria-hidden="true">
			<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="5" />
			{#if frame !== 'bronze'}
				<circle
					cx="50"
					cy="50"
					r="40.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					opacity="0.6"
				/>
				<path d="M-1 50L4 43L9 50L4 57ZM91 50L96 43L101 50L96 57Z" fill="currentColor" />
			{/if}
			{#if frame === 'gold'}
				<path
					d="M37 7L41 -4L50 2L59 -4L63 7Z"
					fill="currentColor"
					stroke="var(--surface)"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
			{/if}
		</svg>
	</span>
{:else}
	{@render face()}
{/if}
```

with `const TIER = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;` in the script.

- [ ] **Step 2: `src/lib/components/Flair.svelte`** (the badge)

```svelte
<script lang="ts">
	import type { Badge } from '#lib/league/cosmetics.ts';

	// The equipped badge: the achievement's icon in the DS flair chip, tier-coloured.
	let { badge }: { badge: Badge } = $props();
</script>

<span
	class="pb-flair pb-flair-icon pb-flair-{badge.tier ?? 'one'}"
	role="img"
	aria-label="{badge.name} badge"
	title={badge.name}
	><img class="pb-flair-ico" src={badge.icon} alt="" width="14" height="14" /></span
>
```

- [ ] **Step 3: `PlayerName.svelte` gets `badge`.** Add `badge = null` (`badge?: Badge | null`, type import from `#lib/league/cosmetics.ts`). Right after the name `<span>` and before #141's `tag` badge, add `{#if badge && !former}<Flair {badge} />{/if}`.

- [ ] **Step 4: `MatchCard.svelte`'s `Side` gets `badge?: Badge | null`.** Inside `.pb-match-nm`, after the name link/text and before #141's tag and the die, add `{#if s.badge && !s.former}<Flair badge={s.badge} />{/if}`. Only the top-cut page sets it (Task 8).

- [ ] **Step 5: `src/app.css`** (append)

```css
/* Cosmetics: the badge chip holds the achievement's own icon (DS Flair, icon-only). */
.pb-flair-icon > img.pb-flair-ico {
	object-fit: cover; /* tier emblems are 16:9 with the crest centred */
	border-radius: 50%;
}
/* Equipped title under the name: tier colour, accent for one-offs. */
.cos-title {
	font: 600 15px/20px var(--font-sans);
	color: var(--accent);
	overflow-wrap: anywhere;
}
.cos-title[data-tier='bronze'] {
	color: var(--tier-bronze);
}
.cos-title[data-tier='silver'] {
	color: var(--tier-silver);
}
.cos-title[data-tier='gold'] {
	color: var(--tier-gold);
}
```

- [ ] **Step 6: Check it builds.** Run: `npm run check`. Expected: 0 errors. Nothing renders these props yet. The e2e tests in Task 9 cover them.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components src/app.css
git commit -m "feat(cosmetics): avatar frame, badge chip and title styles"
```

---

### Task 6: Career page header, Customize form and action

**Files:**

- Modify: `src/routes/players/[id]/+page.server.ts`, `src/routes/players/[id]/+page.svelte`, `src/app.css`
- Create: `src/lib/components/Customize.svelte`
- Test: `src/lib/server/cosmetics.spec.ts`

Design reference: CosCareer / CosMobileCareer boards (header with frame, badge and title; "Customize your profile" panel with preview). Take the layout and tokens. The issue wins on the badge (icon), the pickers (selects) and the copy (badge, not "flair").

- [ ] **Step 1: Write the failing tests** (append to `cosmetics.spec.ts`; add the imports `isRedirect` from `@sveltejs/kit`, `seedEntries, seedSeason` from the seed, and `actions as careerActions, load as careerPage` from `'../../routes/players/[id]/+page.server.ts'`)

```ts
type User = NonNullable<App.Locals['user']>;
const as = (id: string): User => ({ id, displayName: id, avatar: null, isOrganizer: false });
const event = (id: string, user: User | null, form: Record<string, string> = {}) => {
	const url = new URL(`http://localhost/players/${id}`);
	const body = new FormData();
	for (const [k, v] of Object.entries(form)) body.set(k, v);
	return {
		params: { id },
		url,
		locals: { user, session: user && { id: 'sess', accessToken: 'tok' } },
		request: new Request(url, { method: 'POST', body })
	} as never;
};
const customize = (id: string, user: User | null, form: Record<string, string>) =>
	careerActions.customize!(event(id, user, form));
const career = async (id: string, user: User | null) =>
	(await careerPage(event(id, user))) as Exclude<Awaited<ReturnType<typeof careerPage>>, void>;
const inSeason = () => {
	seedPlayers(2);
	seedEntries(seedSeason({ status: 'play' }).id, ['p1', 'p2'], 1);
	earn('p1', ['first-blood', 'legend-ahri-master']);
};

describe('career page', () => {
	it('the owner equips, and everyone sees the look', async () => {
		inSeason();
		expect(
			await customize('p1', as('p1'), {
				title: 'legend-ahri-master',
				badge: 'first-blood',
				frame: 'legend-ahri-master'
			})
		).toEqual({ message: 'Profile updated.' });
		const d = await career('p1', null);
		expect(d.cosmetics).toEqual({
			title: { text: 'Ahri Master', tier: 'gold' },
			badge: { name: 'First Blood', icon: '/achievements/items/first-blood.png', tier: null },
			frame: 'gold'
		});
		expect(d.customize).toBeNull();
	});

	it('only the owner gets the Customize form, with their earned choices', async () => {
		inSeason();
		expect((await career('p1', as('p2'))).customize).toBeNull();
		const mine = (await career('p1', as('p1'))).customize!;
		expect(mine.choices.frames.map((o) => o.id)).toEqual(['legend-ahri-master']);
		expect(mine.equipped).toEqual({ title: null, badge: null, frame: null });
		expect(mine.left).toBe(ACHIEVEMENTS.length - 2);
	});

	it("refuses another player's profile and logged-out visitors", async () => {
		inSeason();
		earn('p2', ['first-blood']);
		const r = (await customize('p1', as('p2'), { title: 'first-blood', badge: '', frame: '' })) as {
			status: number;
		};
		expect(r.status).toBe(403);
		expect(slots('p1')).toEqual([null, null, null]);
		try {
			await customize('p1', null, { title: 'first-blood' });
			throw new Error('expected a redirect');
		} catch (e) {
			expect(isRedirect(e) && e.location).toMatch(/^\/auth\/login/);
		}
	});

	it('refuses an unearned achievement with a message, and clears with empty values', async () => {
		inSeason();
		const r = (await customize('p1', as('p1'), { title: 'champion', badge: '', frame: '' })) as {
			status: number;
			data: { message: string };
		};
		expect(r.status).toBe(400);
		expect(r.data.message).toBe('You haven’t earned that title.');
		await customize('p1', as('p1'), { title: 'first-blood', badge: '', frame: '' });
		await customize('p1', as('p1'), { title: '', badge: '', frame: '' });
		expect(slots('p1')).toEqual([null, null, null]);
	});
});
```

(Add `import { ACHIEVEMENTS } from '#lib/league/achievements.ts';`.)

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/server/cosmetics.spec.ts`
Expected: FAIL. `careerActions` is undefined and `cosmetics` is missing.

- [ ] **Step 3: Load and action** (`src/routes/players/[id]/+page.server.ts`). Change the signature to `({ params, locals })`, keep #142's `achievements`, and add:

```ts
import { error, fail } from '@sveltejs/kit';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';
import { choices, look, picks, type Slot } from '#lib/league/cosmetics.ts';
import { playerAction } from '#lib/server/auth.ts';
import { equip, ownedAchievements } from '#lib/server/cosmetics.ts';
import type { Actions, PageServerLoad } from './$types';

// in load, after `list` is known:
	const me = list[0].me;
	const c = locals.user?.id === params.id ? choices(ownedAchievements(params.id)) : null;
// in the returned object:
		cosmetics: look(me),
		customize: c && { choices: c, equipped: picks(me), left: ACHIEVEMENTS.length - c.badges.length },

export const actions: Actions = {
	// The owner equips earned achievements. Not a result change: no audit row.
	customize: async (event) => {
		const user = playerAction(event);
		if (user.id !== event.params.id)
			return fail(403, { message: 'You can only customize your own profile.' });
		const form = await event.request.formData();
		const pick = (k: Slot) => String(form.get(k) ?? '') || null;
		const bad = equip(user.id, { title: pick('title'), badge: pick('badge'), frame: pick('frame') });
		if (bad === 'frame')
			return fail(400, { message: 'Pick a frame from a Bronze, Silver or Gold achievement you’ve earned.' });
		if (bad) return fail(400, { message: `You haven’t earned that ${bad}.` });
		return { message: 'Profile updated.' };
	}
};
```

`list[0].me` comes from `seasonEntries`, so it already carries the three columns (Task 3).

- [ ] **Step 4: `src/lib/components/Customize.svelte`**

```svelte
<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import Flair from '#lib/components/Flair.svelte';
	import PlayerName from '#lib/components/PlayerName.svelte';
	import type { Choices, Option, Picks } from '#lib/league/cosmetics.ts';

	// The owner's Customize panel: three selects over earned achievements, previewed live.
	let {
		name,
		avatar,
		choices,
		equipped,
		left
	}: { name: string; avatar: string | null; choices: Choices; equipped: Picks; left: number } =
		$props();
	let title = $derived(equipped.title ?? '');
	let badge = $derived(equipped.badge ?? '');
	let frame = $derived(equipped.frame ?? '');
	const find = (l: Option[], id: string) => l.find((o) => o.id === id) ?? null;
	const t = $derived(find(choices.titles, title));
	const b = $derived(find(choices.badges, badge));
	const f = $derived(find(choices.frames, frame));
	const flair = $derived(b && { name: b.label, icon: b.icon, tier: b.tier });
	const empty = $derived(!choices.badges.length);
</script>

<details class="cz">
	<summary class="pb-btn pb-btn-secondary pb-btn-sm">Customize profile</summary>
	<form method="POST" action="?/customize" aria-labelledby="cz-h">
		<div class="cz-head">
			<h2 id="cz-h">Customize your profile</h2>
			<p class="muted small">
				{empty
					? 'Nothing earned yet. Titles, badges and frames unlock with the achievements below.'
					: `Only what you’ve earned shows here. ${left} more to earn below.`}
			</p>
		</div>
		<div class="pv" aria-live="polite">
			<span class="eyebrow">Preview</span>
			<div class="pv-head">
				<Avatar {name} src={avatar} size={56} frame={f?.tier ?? null} />
				<div class="pv-who">
					<span class="pv-name"
						>{name}{#if flair}<Flair badge={flair} />{/if}</span
					>
					{#if t}<span class="cos-title" data-tier={t.tier}>{t.label}</span>{/if}
				</div>
			</div>
			<span class="eyebrow">In standings and the bracket</span>
			<div class="pv-row"><PlayerName {name} {avatar} badge={flair} /></div>
		</div>
		{#if !empty}
			{#each [['title', 'Title', choices.titles], ['badge', 'Badge', choices.badges], ['frame', 'Avatar frame', choices.frames]] as const as [key, label, list] (key)}
				<label class="pb-field"
					>{label}
					{#if key === 'title'}
						<select class="pb-input pb-select" name="title" bind:value={title}>
							<option value="">None</option>
							{#each list as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
						</select>
					{:else if key === 'badge'}
						<select class="pb-input pb-select" name="badge" bind:value={badge}>
							<option value="">None</option>
							{#each list as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
						</select>
					{:else}
						<select class="pb-input pb-select" name="frame" bind:value={frame}>
							<option value="">None</option>
							{#each list as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
						</select>
					{/if}
				</label>
			{/each}
		{/if}
		<div><button class="pb-btn pb-btn-primary" disabled={empty}>Save</button></div>
	</form>
</details>
```

(If the `{#each … as const}` tuple doesn't type-check, write the three `<label>` blocks out by hand. `bind:value` needs a distinct variable per select, which is why the branches exist.)

Append to `src/app.css`. The values come from the board's `.cz` rules, already on tokens:

```css
.cz > summary {
	list-style: none;
	width: fit-content;
}
.cz > summary::-webkit-details-marker {
	display: none;
}
.cz[open] > form {
	margin-top: 16px;
	display: flex;
	flex-direction: column;
	gap: 20px;
	padding: 24px;
	background: var(--surface-raised);
	border: 1px solid var(--line);
	border-radius: var(--radius-md);
}
.cz h2 {
	margin: 0;
	font: 600 20px/26px var(--font-display);
}
.cz .pv {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	background: var(--surface);
	border: 1px dashed var(--line);
	border-radius: var(--radius-md);
}
.cz .pv-head {
	display: flex;
	align-items: center;
	gap: 14px;
	min-width: 0;
}
.cz .pv-who {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}
.cz .pv-name {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 8px;
	font: 700 22px/28px var(--font-display);
	overflow-wrap: anywhere;
}
.cz .pv-row {
	padding: 8px 10px;
	border-radius: var(--radius-sm);
	background: var(--frost);
	min-width: 0;
}
.cz select {
	max-width: 100%;
}
@media (max-width: 640px) {
	.cz[open] > form {
		padding: 16px;
	}
}
```

- [ ] **Step 5: Header and form on the page** (`src/routes/players/[id]/+page.svelte`)

```svelte
{#if form?.message}<p class="pb-notice" role="status">{form.message}</p>{/if}

<section class="player-head" aria-labelledby="player-h">
	<Avatar
		name={player.displayName}
		src={player.avatar}
		size={72}
		former={player.former}
		frame={data.cosmetics.frame}
	/>
	<div class="who">
		<span class="eyebrow">Career</span>
		<div class="name-row">
			<h1 id="player-h" class={[player.former && 'pb-former']}>{player.displayName}</h1>
			{#if data.cosmetics.badge}<Flair badge={data.cosmetics.badge} />{/if}
		</div>
		{#if data.cosmetics.title}
			<span class="cos-title" data-tier={data.cosmetics.title.tier}
				>{data.cosmetics.title.text}</span
			>
		{/if}
		<span class="muted small">{n} season{n === 1 ? '' : 's'} · first season {data.first}</span>
	</div>
</section>

{#if data.customize}
	<Customize name={player.displayName} avatar={player.avatar} {...data.customize} />
{/if}
```

Change the props to `let { data, form }: PageProps = $props();` and import `Customize` and `Flair`. Add `.name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }` and `.who { min-width: 0 }` to the page `<style>`.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/server/cosmetics.spec.ts src/lib/server/pages.spec.ts && npm run check`
Expected: PASS. The existing career tests still pass, since `locals` is in their fake event.

- [ ] **Step 7: Commit**

```bash
git add src/routes/players src/lib/components/Customize.svelte src/app.css src/lib/server/cosmetics.spec.ts
git commit -m "feat(cosmetics): customize form and cosmetics on the career page"
```

---

### Task 7: Season player page header

**Files:**

- Modify: `src/routes/seasons/[slug]/players/[id]/+page.server.ts`, `+page.svelte`
- Test: `src/lib/server/cosmetics.spec.ts`

Design reference: CosPlayer board. Frame on the avatar; the name row is h1, then badge, then the "Career" link; the title line sits under it.

- [ ] **Step 1: Write the failing test** (append; import `load as seasonPlayerPage` from `'../../routes/seasons/[slug]/players/[id]/+page.server.ts'` and `equip`)

```ts
it('the season player page shows the same look', async () => {
	inSeason();
	equip('p1', { title: 'first-blood', badge: null, frame: 'legend-ahri-master' });
	const d = (await seasonPlayerPage({
		params: { slug: 's1', id: 'p1' },
		locals: { user: null, session: null },
		url: new URL('http://localhost/x')
	} as never)) as { cosmetics: unknown };
	expect(d.cosmetics).toEqual({
		title: { text: 'First Blood', tier: null },
		badge: null,
		frame: 'gold'
	});
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx vitest run src/lib/server/cosmetics.spec.ts`. Expected: FAIL, `cosmetics` is undefined.

- [ ] **Step 3: Load.** Import `look` from `#lib/league/cosmetics.ts`. Add `cosmetics: look(player),` to the returned object (`player` is a `seasonEntries` row).

- [ ] **Step 4: Render.** In `+page.svelte`'s `.player-head`, give the section `aria-labelledby="player-h"`, the `<Avatar>` `frame={data.cosmetics.frame}` and the `<h1>` `id="player-h"`. Put `{#if data.cosmetics.badge}<Flair badge={data.cosmetics.badge} />{/if}` between the h1 and the Career link in `.name-row`. Right after `.name-row`, add `{#if data.cosmetics.title}<span class="cos-title" data-tier={data.cosmetics.title.tier}>{data.cosmetics.title.text}</span>{/if}`. If `.name-row` doesn't wrap yet, give it `flex-wrap: wrap; align-items: center; gap: 4px 12px`, and give `.head-text` `min-width: 0`.

- [ ] **Step 5: Run the tests and confirm they pass.** Run: `npx vitest run src/lib/server/cosmetics.spec.ts src/lib/server/pages.spec.ts && npm run check`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/seasons/[slug]/players" src/lib/server/cosmetics.spec.ts
git commit -m "feat(cosmetics): cosmetics on the season player page"
```

---

### Task 8: Badge in standings and the top-cut bracket

**Files:**

- Modify: `src/lib/server/seasons.ts` (`groupStandings`), `src/lib/components/StandingsTable.svelte`, `src/lib/matchCard.ts`, `src/routes/seasons/[slug]/top-cut/+page.server.ts`, `+page.svelte`
- Test: `src/lib/server/cosmetics.spec.ts`, `src/lib/matchCard.spec.ts`

Design reference: CosStandings and CosMobileStandings. The badge comes after the name in the standings row and the bracket box, with the name ellipsing before the badge. On phones the bracket is the cards. Badges are icon-only everywhere (issue: "small icon").

- [ ] **Step 1: Write the failing tests.** Append to `cosmetics.spec.ts`. Import `groupStandings, seasonEntries` from seasons, `publishCut, cutState` from topCut, `load as topCutPage` from `'../../routes/seasons/[slug]/top-cut/+page.server.ts'`, `load as schedulePage` from `'../../routes/seasons/[slug]/schedule/+page.server.ts'`, `seasons` from schema, `seedMatch` from the seed.

```ts
const FB = { name: 'First Blood', icon: '/achievements/items/first-blood.png', tier: null };

it('standings rows carry the badge, nothing else', () => {
	inSeason();
	equip('p1', { title: 'first-blood', badge: 'first-blood', frame: 'legend-ahri-master' });
	const s = db.select().from(seasons).get()!;
	const rows = groupStandings(s, seasonEntries(s.id))[0].rows;
	expect(rows.find((r) => r.playerId === 'p1')!.badge).toEqual(FB);
	expect(rows.find((r) => r.playerId === 'p2')!.badge).toBeNull();
});

describe('top cut', () => {
	// Two groups of three, all played, top 2 per group: p1 and p4 seed first.
	const cut = () => {
		seedPlayers(6);
		const id = seedSeason({ status: 'topcut', topCutSize: 2, publishedRound: 9 }).id;
		seedEntries(id, ['p1', 'p2', 'p3'], 1);
		seedEntries(id, ['p4', 'p5', 'p6'], 2);
		for (const [g, a, b, c] of [
			[1, 'p1', 'p2', 'p3'],
			[2, 'p4', 'p5', 'p6']
		] as const)
			for (const [x, y] of [
				[a, b],
				[a, c],
				[b, c]
			])
				seedMatch({
					seasonId: id,
					group: g,
					round: 1,
					p1Id: x,
					p2Id: y,
					p1Games: 2,
					p2Games: 0,
					reportedBy: x
				});
		const season = db.select().from(seasons).where(eq(seasons.id, id)).get()!;
		publishCut(season, null, 'p1');
		earn('p1', ['first-blood']);
		equip('p1', { title: 'first-blood', badge: 'first-blood', frame: null });
		return season;
	};
	const ev = (slug: string) =>
		({
			params: { slug },
			locals: { user: null, session: null },
			url: new URL('http://localhost/x')
		}) as never;

	it('bracket slots and cards carry the badge', async () => {
		cut();
		const d = (await topCutPage(ev('s1'))) as {
			rounds: {
				slots: {
					p1: { id: string; badge: unknown } | null;
					card: { props: { sides: { badge?: unknown }[] } } | null;
				}[];
			}[];
		};
		const slot = d.rounds[0].slots.find((s) => s.p1?.id === 'p1')!;
		expect(slot.p1!.badge).toEqual(FB);
		expect(slot.card!.props.sides[0].badge).toEqual(FB);
	});

	it('other cards stay plain', async () => {
		cut();
		const d = (await schedulePage(ev('s1'))) as unknown;
		expect(JSON.stringify(d)).not.toContain('first-blood.png');
	});
});
```

In `src/lib/matchCard.spec.ts`, add a unit test: `withBadges(card, (id) => (id === m.p1Id ? FB : null), m)` gives `sides.map((s) => s.badge)` = `[FB, null]`, and leaves the input card's sides without a `badge` key. Build `card` the way the file's existing tests do.

- [ ] **Step 2: Run them and confirm they fail.** Run: `npx vitest run src/lib/server/cosmetics.spec.ts src/lib/matchCard.spec.ts`. Expected: FAIL, `badge` is undefined and `withBadges` is not exported. (If the schedule load needs a schedule status, the "other cards" test passes either way. Keep it as the guard.)

- [ ] **Step 3: Standings rows.** In `groupStandings`, import `look` and add `badge: look(by.get(r.playerId)!).badge,` next to `former`.

- [ ] **Step 4: `StandingsTable.svelte`.** Pass `badge={r.badge}` to `<PlayerName cell …>`.

- [ ] **Step 5: `withBadges` in `src/lib/matchCard.ts`**

```ts
import type { Badge } from '#lib/league/cosmetics.ts';

type Badged = Card['props']['sides'][number] & { badge: Badge | null };
// Top cut only: every other card keeps plain names.
export function withBadges(
	card: Card,
	badge: (id: string) => Badge | null,
	m: { p1Id: string; p2Id: string }
) {
	const [a, b] = card.props.sides;
	const sides: [Badged, Badged] = [
		{ ...a, badge: badge(m.p1Id) },
		{ ...b, badge: badge(m.p2Id) }
	];
	return { ...card, props: { ...card.props, sides } };
}
```

(Use the module's existing `Card` type, the one `pages.spec.ts` imports. If it's declared after this point, put `withBadges` below it.)

- [ ] **Step 6: Top-cut load.** In `top-cut/+page.server.ts`, import `look` and `withBadges`, then:

```ts
const entry = (id: string | null) => (id ? people.find((x) => x.playerId === id) : undefined);
const badge = (id: string) => {
	const e = entry(id);
	return e ? look(e).badge : null;
};
const who = (id: string | null) => {
	const e = entry(id);
	return e
		? {
				id: e.playerId,
				name: e.displayName,
				former: e.former,
				label: s.label(e.playerId),
				badge: look(e).badge
			}
		: null;
};
// …
card: x.match ? withBadges(matchCard(x.match, ctx), badge, x.match) : null;
```

- [ ] **Step 7: Top-cut desktop bracket markup** (`top-cut/+page.svelte`). Import `Flair`, then replace `<span class="nm">{p?.name ?? (s.bye ? 'Bye' : 'TBD')}</span>` with:

```svelte
<span class="nm"
	><span class="t">{p?.name ?? (s.bye ? 'Bye' : 'TBD')}</span>{#if p?.badge && !p.former}<Flair
			badge={p.badge}
		/>{/if}</span
>
```

Styles: replace the `.nm` rule with `.nm { display: flex; align-items: center; gap: 6px; min-width: 0; }` plus `.nm > .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }`. Change `.bp.w .nm` to `.bp.w .t` and `.bp.l .nm` to `.bp.l .t`. The phone cards already render `s.card.props` through `MatchCard`, which shows `badge` (Task 5).

- [ ] **Step 8: Run the tests and confirm they pass.** Run: `npx vitest run && npm run check`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/seasons.ts src/lib/components/StandingsTable.svelte src/lib/matchCard.ts src/lib/matchCard.spec.ts "src/routes/seasons/[slug]/top-cut" src/lib/server/cosmetics.spec.ts
git commit -m "feat(cosmetics): badge in standings and the top-cut bracket"
```

---

### Task 9: e2e

**Files:**

- Modify: `e2e/fixtures.ts`, `e2e/db.ts`, `e2e/top-cut.spec.ts`, `e2e/mobile.spec.ts`
- Create: `e2e/cosmetics.spec.ts`

- [ ] **Step 1: Helpers.** Add `cosmetics: 'e2e-cosmetics'` to `SEASONS`. In `e2e/db.ts`, next to #142's `seedAchievements`:

```ts
// Equipped cosmetics as if saved on the career page; seed the achievements first (seedAchievements).
export const seedCosmetics = (
	playerId: string,
	c: { title?: string | null; badge?: string | null; frame?: string | null }
) =>
	write((db) =>
		db
			.prepare(
				'update players set title_achievement = ?, badge_achievement = ?, frame_achievement = ? where id = ?'
			)
			.run(c.title ?? null, c.badge ?? null, c.frame ?? null, playerId)
	);
```

- [ ] **Step 2: `e2e/cosmetics.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { removeSeason, seedResult, seedSeason } from './db.ts';
import { PORT, SEASONS, as, player, playerName } from './fixtures.ts';

const slug = SEASONS.cosmetics;
const me = player('cosmetics', 1);
const name = playerName('cosmetics', 1);
let third: number; // round 3: Cosmetics 1 vs Cosmetics 4

// Two Ahri matches already in (seeded, so nothing awarded yet): a 2–0 win and a 0–2 loss.
test.beforeAll(() => {
	const ids = seedSeason('cosmetics', { publishedRound: 3 });
	seedResult(ids[0], 2, 0);
	seedResult(ids[2], 0, 2);
	third = ids[4];
});
test.afterAll(() => removeSeason('cosmetics'));

test('earn, equip, show; badge only in standings; clear a slot', async ({ browser }) => {
	const page = await browser.newPage(as(me));
	// The third Ahri match earns Ahri Player (bronze); the earlier win earns First Blood.
	await page.goto(`/seasons/${slug}/matches/${third}`);
	await page.getByLabel('Legend').nth(0).selectOption('Ahri');
	await page.getByLabel('Legend').nth(1).selectOption('Annie');
	await page.getByRole('group', { name: 'Who won the dice roll?' }).getByLabel(name).check();
	for (const g of [1, 2])
		await page
			.getByRole('radiogroup', { name: new RegExp(`^Game ${g}`) })
			.getByLabel(name)
			.check();
	await page.getByRole('button', { name: 'Add result' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Save result' }).click();
	await expect(page.getByRole('status')).toContainText('Result saved');

	await page.goto(`/players/${me}`);
	await page.getByText('Customize profile', { exact: true }).click();
	const form = page.getByRole('form', { name: 'Customize your profile' });
	await form.getByLabel('Title').selectOption({ label: 'Ahri Player' });
	await form.getByLabel('Badge').selectOption({ label: 'First Blood' });
	await form.getByLabel('Avatar frame').selectOption({ label: 'Bronze · Ahri Player' });
	await expect(form.getByRole('img', { name: 'Bronze frame' })).toBeVisible(); // live preview
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('Profile updated');

	for (const path of [`/players/${me}`, `/seasons/${slug}/players/${me}`]) {
		await page.goto(path);
		const head = page.getByRole('region', { name });
		await expect(head.getByText('Ahri Player', { exact: true })).toBeVisible();
		await expect(head.getByRole('img', { name: 'First Blood badge' })).toBeVisible();
		await expect(head.getByRole('img', { name: 'Bronze frame' })).toBeVisible();
	}

	await page.goto(`/seasons/${slug}`);
	const row = page.getByRole('row').filter({ hasText: name });
	await expect(row.getByRole('img', { name: 'First Blood badge' })).toBeVisible();
	await expect(row.getByText('Ahri Player')).toHaveCount(0);
	await expect(row.getByRole('img', { name: 'Bronze frame' })).toHaveCount(0);
	await page.goto(`/seasons/${slug}/schedule`);
	await expect(page.getByRole('img', { name: 'First Blood badge' })).toHaveCount(0);

	await page.goto(`/players/${me}`);
	await page.getByText('Customize profile', { exact: true }).click();
	await form.getByLabel('Title').selectOption({ label: 'None' });
	await form.getByRole('button', { name: 'Save' }).click();
	const head = page.getByRole('region', { name });
	await expect(head.getByText('Ahri Player', { exact: true })).toHaveCount(0);
	await expect(head.getByRole('img', { name: 'First Blood badge' })).toBeVisible();
});

test("another player can't customize someone else's profile", async ({ browser }) => {
	const page = await browser.newPage(as(player('cosmetics', 2)));
	await page.goto(`/players/${me}`);
	await expect(page.getByText('Customize profile')).toHaveCount(0);
	// A hand-made same-origin POST (the production build's CSRF check passes it).
	const res = await page.request.post(`/players/${me}?/customize`, {
		form: { title: 'first-blood', badge: '', frame: '' },
		headers: { origin: `http://localhost:${PORT}` }
	});
	expect(res.status()).toBe(403);
	await page.goto(`/players/${me}`);
	await expect(
		page.getByRole('region', { name }).getByText('First Blood', { exact: true })
	).toHaveCount(0);
});
```

If the action POST answers 200 instead of 403, SvelteKit treated it as an enhanced request. Drop any `x-sveltekit-action` header and check that `accept` isn't `application/json`.

- [ ] **Step 3: Bracket badge, desktop and phone** (`e2e/top-cut.spec.ts`). Import `seedAchievements, seedCosmetics`. In `beforeAll`, after `seedFinishedGroups('topCut')`:

```ts
seedAchievements(player('topCut', 1), ['legend-master-yi-pg-master']);
seedCosmetics(player('topCut', 1), {
	title: 'legend-master-yi-pg-master',
	badge: 'legend-master-yi-pg-master'
});
```

Add a test after "top cut from setup to champion":

```ts
test('the bracket shows badges, not titles', async ({ page }) => {
	await page.goto(`/seasons/${slug}/top-cut`);
	const bracket = page.getByRole('region', { name: 'Bracket' });
	await expect(
		bracket.getByRole('img', { name: 'Master Yi (PG) Master badge' }).first()
	).toBeVisible();
	await expect(bracket.getByText('Master Yi (PG) Master', { exact: true })).toHaveCount(0);
});
```

In "the bracket on a phone…", at the end:

```ts
await page
	.getByRole('group', { name: 'Rounds' })
	.getByRole('button', { name: 'Semifinals' })
	.click();
await expect(page.getByRole('img', { name: 'Master Yi (PG) Master badge' }).first()).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
```

- [ ] **Step 4: Phones with everything equipped** (`e2e/mobile.spec.ts`). Import `seedCosmetics`. In `beforeAll`, add `'legend-master-yi-pg-master'` to #142's `seedAchievements(me, …)` list, and add `seedCosmetics(me, { title: 'legend-master-yi-pg-master', badge: 'legend-master-yi-pg-master', frame: 'legend-master-yi-pg-master' });`. Career, season player page and season standings are already in the visitor and player lists, and now carry the longest title. Add `` `/players/${me}` `` to the `player` list, then add:

```ts
test.describe('customize', () => {
	test.use(as(me));
	test('the open Customize panel fits a phone', async ({ page }) => {
		await page.goto(`/players/${me}`);
		await page.getByText('Customize profile', { exact: true }).click();
		const r = await page.evaluate(probe, W);
		expect.soft(r.scroll, 'scrolls sideways').toBe(false);
		expect.soft(r.outer, 'cut off at the right edge').toEqual([]);
	});
});
```

Put it before the last test ("signup page fits a phone"), which removes the mobile season.

- [ ] **Step 5: Run them and confirm they pass**

Run: `npm run test:e2e -- e2e/cosmetics.spec.ts e2e/top-cut.spec.ts e2e/mobile.spec.ts`
Expected: PASS. Break it once: comment out the `user.id !== event.params.id` guard, rebuild, and the "another player" test must FAIL. Restore it.

- [ ] **Step 6: Commit**

```bash
git add e2e
git commit -m "test(cosmetics): equip flow, bracket badge and phone layouts"
```

---

### Task 10: Dev data

**Files:**

- Modify: `scripts/reseed-dev.ts`, `scripts/achievements-dev.ts`, `README.md`

- [ ] **Step 1: `reseed-dev.ts`.** In the wipe `db.exec` (where #142 put `delete from player_achievements;`), add `update players set title_achievement = null, badge_achievement = null, frame_achievement = null;`. Your kept player's old picks would otherwise point at achievements the reseed just deleted. Then, after #142's `backfillAchievements(...)` and its log lines, add:

```ts
// Cosmetics: most fake players equip something they earned, some nothing; the player with the most
// achievements also gets the longest title, for header wrapping at 390 px.
const LONGEST = ACHIEVEMENTS.reduce((a, b) => (b.title.length > a.title.length ? b : a));
const earnedBy = db.prepare(
	'select achievement_id id from player_achievements where player_id = ?'
);
const setLook = db.prepare(
	'update players set title_achievement = ?, badge_achievement = ?, frame_achievement = ? where id = ?'
);
const fakes = db
	.prepare('select id from players where id <> ? and erased_at is null order by id')
	.all(ME) as { id: string }[];
for (const { id } of fakes) {
	const mine = (earnedBy.all(id) as { id: string }[]).map((r) => r.id);
	if (!mine.length || rand() < 0.25) continue;
	const maybe = (l: string[]) => (l.length && rand() < 0.8 ? pick(l) : null);
	setLook.run(
		maybe(mine),
		maybe(mine),
		maybe(mine.filter((x) => achievementById.get(x)?.tier)),
		id
	);
}
const top = db
	.prepare(
		'select player_id id from player_achievements where player_id <> ? group by player_id order by count(*) desc, player_id limit 1'
	)
	.get(ME) as { id: string };
db.prepare(
	'insert or ignore into player_achievements (player_id, achievement_id, unlocked_at) values (?, ?, unixepoch())'
).run(top.id, LONGEST.id);
db.prepare(
	'update players set title_achievement = ?, badge_achievement = ?, frame_achievement = ? where id = ?'
).run(LONGEST.id, LONGEST.id, LONGEST.id, top.id);
console.log(
	'Cosmetics:',
	db
		.prepare(
			`select count(title_achievement) titles, count(badge_achievement) badges, count(frame_achievement) frames,
			 sum(title_achievement is null and badge_achievement is null and frame_achievement is null) bare from players`
		)
		.get(),
	`· longest title "${LONGEST.title}"`
);
```

Extend the `#lib/league/achievements.ts` import with `achievementById`. The header comment gains: "Fake players equip random cosmetics from what they earned (some none, one with the longest title)."

- [ ] **Step 2: `achievements-dev.ts`.** In the `none` branch, also run `update players set title_achievement = null, badge_achievement = null, frame_achievement = null where id = ?` for `me.id`. Otherwise you'd keep cosmetics you no longer own.

- [ ] **Step 3: README.** Under "Fake players": "`db:reseed-dev` also equips cosmetics: most fake players wear something they earned, some nothing, and the player with the most achievements wears the longest title (`Master Yi (PG) Master`), for checking standings, the bracket and phones. Unlock everything for yourself with `npm run db:achievements-dev -- <your-discord-id> all`, then equip it on your career page; `none` also takes your cosmetics off."

- [ ] **Step 4: Verify on a copy** (leaves the owner's `local.db` and dev server alone)

```bash
cp local.db /tmp/claude-1000/cos-dev.db
DATABASE_URL=/tmp/claude-1000/cos-dev.db node scripts/migrate.ts
DATABASE_URL=/tmp/claude-1000/cos-dev.db node scripts/reseed-dev.ts <owner-discord-id>
DATABASE_URL=/tmp/claude-1000/cos-dev.db node scripts/achievements-dev.ts <owner-discord-id> all
sqlite3 /tmp/claude-1000/cos-dev.db "update players set badge_achievement = 'first-blood' where discord_id = '<owner-discord-id>'"
DATABASE_URL=/tmp/claude-1000/cos-dev.db node scripts/achievements-dev.ts <owner-discord-id> none
sqlite3 /tmp/claude-1000/cos-dev.db "select badge_achievement from players where discord_id = '<owner-discord-id>'"
```

Expected: the "Cosmetics:" line shows titles, badges and frames all > 0 and `bare` ≥ 2 (the newcomer, plus anyone the 25% skipped), with `longest title "Master Yi (PG) Master"`. The last select prints an empty value.

- [ ] **Step 5: Commit**

```bash
git add scripts README.md
git commit -m "feat(cosmetics): dev data with equipped cosmetics"
```

---

### Task 11: Docs

**Files:** Modify `docs/spec.md`, `docs/erasure.md`.

- [ ] **Step 1: `docs/spec.md`.** After #142's `## Achievements`, add `## Profile cosmetics`, covering:
  - the slots (title, badge = icon, frame = tier ring), each from one earned achievement;
  - title text from the definition;
  - frames only from tiered achievements;
  - all optional;
  - the columns on `players`;
  - equipping is owner-only from the career page's Customize panel, validated server-side, with no audit row and no moderation;
  - where they show (career and season player page headers; badge only in standings and the top cut; plain names elsewhere, in Discord and in the API until #144);
  - name and avatar stay synced from Discord;
  - erasure clears them.
- [ ] **Step 2: `docs/erasure.md`.** Add "clears their equipped title, badge and frame" to step 1's list.
- [ ] **Step 3:** Run `npm run lint`. Expected: PASS (`npm run format` if not).
- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs(cosmetics): document profile cosmetics"
```

---

### Task 12: Final verification

- [ ] **Step 1: Full suite**

```bash
npm run lint
npm run check
npx vitest run
npm run test:e2e
```

Expected: all green. `mobile.spec.ts` passes with the longest title equipped. The new specs are listed.

- [ ] **Step 2: Spec coverage walk.**
  - Model and columns: T3.
  - Ownership and owner-only checks: T4 and T6 (unit), T9 (e2e).
  - Clearing: T4, T6 and T9.
  - Frame from tiered achievements only: T2 and T4.
  - Career and season page display: T6, T7 and T9.
  - Standings and bracket badge at 390: T8 and T9.
  - Plain elsewhere: the schedule assertions in T8 and T9.
  - Not in Discord or the API: no change to `discord.ts` or `api.ts`. `openapi.spec.ts` (closed schemas) still passes.
  - Dev data: T10.
- [ ] **Step 3: By hand.** Start a dev server from the worktree on another port, never a second `npm run dev` beside the owner's :5173. Check these, in both themes, at 1280 px and 390 × 844:
  - a career page with nothing equipped;
  - the longest-title player;
  - the Customize panel (live preview);
  - standings;
  - the Spring top cut (desktop bracket and phone cards).

  Check the gold ring's crown isn't clipped by the head layout. If it is, add `overflow: visible` or extra top padding to `.player-head`.

- [ ] **Step 4: Ask the owner before pushing.** Suggest `/code-review` before merge.
