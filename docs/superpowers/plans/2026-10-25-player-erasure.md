# Player Erasure & Privacy Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the Discord id off the player primary key, let organizers erase (anonymise) a player while keeping results, and publish a privacy notice (issue #78).

**Architecture:** `players.id` stays a text key but becomes a random internal id (`lower(hex(randomblob(8)))`); the Discord id moves to a unique nullable `discord_id`. A hand-written data migration remaps every player column and the ids inside audit JSON. Erasure (`src/lib/server/players.ts`) strips one row (name → "Former player N", no avatar, no Discord id, `erased_at` set), deletes sessions, clears that player's flag reasons, and writes an `erase` audit row per season. Views mark erased players with a `former` flag that renders the design's dashed avatar and muted italic name. `/privacy` renders `docs/privacy.md` with the same renderer as `/rules`.

**Tech Stack:** SvelteKit · Drizzle (better-sqlite3, SQLite 3.53) · Vitest · Playwright

**Deviation from #78:** the ticket said an integer key. A random text key gets the same result (the Discord id is no longer the key) without changing any column type: no SQLite table rebuilds, no TS type churn, and test/e2e seeds keep their readable ids (`p1`, `rules-1`).

**Design:** Poroleague Screens canvas, boards `FeatSignup`, `FeatMobileSignup`, `FeatEraseSection`, `FeatEraseDialog`, `FeatEraseDone`, `FeatFormer`. Design system adds `pb-btn-danger`, `pb-avatar-former`, `pb-former` / `.is-former`, `pb-footer*`.

---

## File map

- Modify `src/lib/styles/porobound.css`: re-sync snapshot from the design system.
- Modify `src/lib/server/db/schema.ts`: `players.discordId`, `players.erasedAt`.
- Create `drizzle/0003_*.sql` (generated) + appended data migration; `drizzle/meta/*` (generated).
- Create `src/lib/server/db/migrate-ids.spec.ts`: migration test against a pre-migration DB.
- Modify `src/lib/discord.ts`: `Profile.discordId`; `pairingsPost` takes a `mention` function.
- Modify `src/routes/auth/callback/+server.ts`: upsert by `discord_id`, new random id.
- Create `src/lib/server/players.ts`: `newPlayerId`, `erasePlayer`, `discordMentions`.
- Modify `src/lib/server/seasons.ts`, `src/lib/server/matches.ts`, `src/lib/matchCard.ts`: carry `former`.
- Modify `src/lib/server/auditLog.ts`: `erase` line, "reason removed".
- Modify `src/lib/components/Avatar.svelte`, `StandingsTable.svelte`, `MatchCard.svelte`, `ConfirmButton.svelte`, and route pages that render names.
- Modify `src/routes/seasons/[slug]/players/[id]/+page.server.ts` / `+page.svelte`: erase action and danger section.
- Modify `src/routes/seasons/[slug]/admin/+page.server.ts`: mentions for pairings.
- Create `docs/privacy.md`, `src/routes/privacy/+page.server.ts`, `src/routes/privacy/+page.svelte`; modify `src/lib/rules.ts` (`renderDoc`), `src/routes/rules/+page.server.ts`, `src/routes/+layout.svelte` (footer), `src/routes/seasons/[slug]/+page.svelte` (signup line).
- Create `docs/erasure.md` (runbook).
- Create `e2e/erase.spec.ts`, `e2e/privacy.spec.ts`; modify `e2e/fixtures.ts` (`erase` season key).

---

### Task 1: Re-sync the design-system CSS

**Files:** Modify `src/lib/styles/porobound.css`

- [ ] **Step 1:** Rebuild the snapshot the way the header describes: `tokens.css` + `components/bundle.css` from the Porobound design system, minus the font `@import`, the `body{…}` rule and the demo helpers (`.pb-row`, `.pb-stack`). Header line: `/* Porobound design system (Claude Design, version 1792915906-c30f). Snapshot: … */`. Format with `npx prettier --write src/lib/styles/porobound.css`.
- [ ] **Step 2:** Confirm the new classes exist: `grep -c "pb-btn-danger\|pb-avatar-former\|pb-former\|pb-footer" src/lib/styles/porobound.css` → non-zero.
- [ ] **Step 3:** `npm run check` → 0 errors. `npx vitest run` → all pass.
- [ ] **Step 4:** Commit `chore: re-sync Porobound design-system CSS (danger button, former player, footer)`.

### Task 2: Schema + id migration

**Files:** Modify `src/lib/server/db/schema.ts`; create `drizzle/0003_*.sql`; create `src/lib/server/db/migrate-ids.spec.ts`

- [ ] **Step 1: Schema.**

```ts
export const players = sqliteTable('players', {
	id: text('id').primaryKey(), // random internal id; never shown to Discord
	discordId: text('discord_id').unique(), // null once erased (and for seeded test players)
	displayName: text('display_name').notNull(),
	avatar: text('avatar'),
	erasedAt: integer('erased_at', { mode: 'timestamp' })
});
```

- [ ] **Step 2:** `npm run db:generate` → creates `drizzle/0003_<name>.sql` with two `ALTER TABLE players ADD` and a unique index.
- [ ] **Step 3: Append the data migration** to that file (each statement separated by `--> statement-breakpoint`):

```sql
UPDATE `players` SET `discord_id` = `id`;
CREATE TEMP TABLE `player_ids` AS SELECT `id` AS `old`, lower(hex(randomblob(8))) AS `new` FROM `players`;
UPDATE `players` SET `id` = (SELECT `new` FROM `player_ids` WHERE `old` = `players`.`id`);
UPDATE `sessions` SET `player_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `player_id`);
UPDATE `entries` SET `player_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `player_id`);
UPDATE `seasons` SET `deleted_by` = (SELECT `new` FROM `player_ids` WHERE `old` = `deleted_by`) WHERE `deleted_by` IS NOT NULL;
UPDATE `matches` SET
  `p1_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `p1_id`),
  `p2_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `p2_id`),
  `dice_winner_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `dice_winner_id`),
  `reported_by` = (SELECT `new` FROM `player_ids` WHERE `old` = `reported_by`),
  `flagged_by` = (SELECT `new` FROM `player_ids` WHERE `old` = `flagged_by`),
  `flag_resolved_by` = (SELECT `new` FROM `player_ids` WHERE `old` = `flag_resolved_by`);
UPDATE `audit` SET `actor_id` = (SELECT `new` FROM `player_ids` WHERE `old` = `actor_id`);
-- ids inside audit JSON: diceWinnerId (before/after of results), dropped, undropped, order[] (tiebreak)
UPDATE `audit` SET `before` = json_set(`before`, '$.diceWinnerId', (SELECT `new` FROM `player_ids` WHERE `old` = json_extract(`before`, '$.diceWinnerId'))) WHERE json_extract(`before`, '$.diceWinnerId') IS NOT NULL;
UPDATE `audit` SET `after` = json_set(`after`, '$.diceWinnerId', (SELECT `new` FROM `player_ids` WHERE `old` = json_extract(`after`, '$.diceWinnerId'))) WHERE json_extract(`after`, '$.diceWinnerId') IS NOT NULL;
UPDATE `audit` SET `after` = json_set(`after`, '$.dropped', (SELECT `new` FROM `player_ids` WHERE `old` = json_extract(`after`, '$.dropped'))) WHERE json_extract(`after`, '$.dropped') IS NOT NULL;
UPDATE `audit` SET `after` = json_set(`after`, '$.undropped', (SELECT `new` FROM `player_ids` WHERE `old` = json_extract(`after`, '$.undropped'))) WHERE json_extract(`after`, '$.undropped') IS NOT NULL;
UPDATE `audit` SET `after` = json_set(`after`, '$.order', json((SELECT json_group_array(p.`new` ORDER BY CAST(j.`key` AS integer)) FROM json_each(`audit`.`after`, '$.order') j JOIN `player_ids` p ON p.`old` = j.`value`))) WHERE json_type(`after`, '$.order') = 'array';
DROP TABLE `player_ids`;
```

Subqueries on a null column return null, so nullable columns stay null.

- [ ] **Step 4: Migration test** `src/lib/server/db/migrate-ids.spec.ts` (no `$app/env/private`; own temp DB like `migrate.spec.ts`). Build the pre-migration DB by migrating with a copy of `drizzle/` whose journal stops at `0002`, seed raw SQL with Discord-style ids covering every player column (two players `111`, `222`; a session; entries; a soft-deleted season with `deleted_by`; a match reported by 111, dice 222, flagged by 222, resolved by 111; audit rows: report with `diceWinnerId`, edit with before/after `diceWinnerId`, drop, undrop, tiebreak `order: ['222','111']`), then run `scripts/migrate.ts` on it and assert:
  - row counts per table unchanged;
  - `players.discord_id` = `111`/`222`, ids are 16 hex chars and differ from the Discord ids;
  - every player FK column and every JSON id matches a `players.id` (map by discord id);
  - `order` keeps its order (`[id(222), id(111)]`);
  - a full text dump (`select * from <table>` for every table, JSON.stringify) contains `111`/`222` only in `players.discord_id`.
- [ ] **Step 5:** Run `npx vitest run src/lib/server/db/` → pass (and `migrate.spec.ts` still passes).
- [ ] **Step 6:** Commit `feat: random player ids; Discord id moves to players.discord_id`.

### Task 3: Login by Discord id; pairings mention by Discord id

**Files:** `src/lib/discord.ts`, `src/lib/discord.spec.ts`, `src/routes/auth/callback/+server.ts`, `src/lib/server/auth.spec.ts`, create `src/lib/server/players.ts`, `src/routes/seasons/[slug]/admin/+page.server.ts`

- [ ] **Step 1: Tests first.**
  - `discord.spec.ts`: `profileFromMember` returns `{ discordId: '80351110224678912', … }`; `pairingsPost(title, url, rounds, mention)` uses `mention(id)` (`(id) => ({ '1': '<@d1>' })[id] ?? 'Name'`).
  - `auth.spec.ts` callback: (a) existing player `{ id: 'abc', discordId: '1001' }` logs in → same row `abc` updated to `Nick`, no second row, session on `abc`; (b) unknown Discord id → one new row with a 16-hex id and `discordId: '1001'`.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement.**
  - `discord.ts`: `export type Profile = { discordId: string; displayName: string; avatar: string }`; `pairingsPost(title, url, rounds, mention: (id: string) => string, at = new Date())`, field value `` `${mention(p.p1Id)} vs ${mention(p.p2Id)}` ``.
  - `src/lib/server/players.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { escapeMd } from '#lib/discord.ts';
import { db } from '#lib/server/db/index.ts';
import { players } from '#lib/server/db/schema.ts';

export const newPlayerId = () => randomBytes(8).toString('hex');

// Embed text for each player: a Discord mention, or the plain name once erased (or never linked).
export function discordMentions(ids: string[]) {
	const rows = db.select().from(players).where(inArray(players.id, ids)).all();
	const by = new Map(rows.map((p) => [p.id, p.discordId ? `<@${p.discordId}>` : escapeMd(p.displayName)]));
	return (id: string) => by.get(id) ?? 'Unknown';
}
```

  - callback: `const { id } = db.insert(players).values({ id: newPlayerId(), ...profile }).onConflictDoUpdate({ target: players.discordId, set: { displayName: profile.displayName, avatar: profile.avatar } }).returning({ id: players.id }).get();` then `createSession(id, …)`.
  - admin publish: `pairingsPost(title, url, p.byRound, discordMentions(p.byRound.flatMap((r) => r.pairs.flatMap((x) => [x.p1Id, x.p2Id]))))`.
- [ ] **Step 4:** `npx vitest run` → pass; `npm run check` → 0 errors.
- [ ] **Step 5:** Commit `feat: log in by Discord id; pairings mention via discord_id`.

### Task 4: `erasePlayer`

**Files:** `src/lib/server/players.ts`, create `src/lib/server/players.spec.ts`

- [ ] **Step 1: Tests** (`players.spec.ts`, using `test/seed.ts`): season with p1–p3 (p1 has `discordId: 'd1'`, avatar, a session), p1 reported vs p2, p1 flagged a match vs p3 with reason "p1 says hi", tiebreak audit with p1 in `order`.
  - standings (`groupStandings`) and legend stats identical before/after, except the name;
  - p1 row: `displayName` `Former player 1`, `avatar` null, `discordId` null, `erasedAt` set; second erased player gets `Former player 2`;
  - p1's sessions gone, p2's session kept;
  - `matches.flag_reason` null where `flagged_by = p1`; p2's flag reason kept; p1's `flag` audit rows have no `flagReason`;
  - one `erase` audit row per season p1 is in: actor = organizer, `after = { erased: p1 }`;
  - text dump of all tables contains no `d1`, `Player 1` or p1's avatar URL;
  - erasing an erased or unknown player throws and changes nothing;
  - a thrown error inside the transaction leaves the DB unchanged (erase a player, then make the audit insert fail by passing an unknown season via spy, or assert via `db.transaction` atomicity: stub `tx.insert` to throw after the player update).
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement** in `players.ts`:

```ts
export function erasePlayer(playerId: string, actorId: string) {
	return db.transaction((tx) => {
		const p = tx.select().from(players).where(eq(players.id, playerId)).get();
		if (!p || p.erasedAt) throw new Error('No such player, or already erased');
		const n = tx.$count(players, isNotNull(players.erasedAt)) + 1;
		const name = `Former player ${n}`;
		tx.update(players)
			.set({ displayName: name, avatar: null, discordId: null, erasedAt: new Date() })
			.where(eq(players.id, playerId))
			.run();
		tx.delete(sessions).where(eq(sessions.playerId, playerId)).run();
		tx.update(matches).set({ flagReason: null }).where(eq(matches.flaggedBy, playerId)).run();
		tx.update(audit)
			.set({ after: sql`json_remove(${audit.after}, '$.flagReason')` })
			.where(and(eq(audit.actorId, playerId), eq(audit.action, 'flag')))
			.run();
		const seasonIds = tx.select({ id: entries.seasonId }).from(entries).where(eq(entries.playerId, playerId)).all();
		for (const { id } of seasonIds)
			tx.insert(audit).values({ seasonId: id, actorId, action: 'erase', after: { erased: playerId } }).run();
		return name;
	});
}
```

- [ ] **Step 4:** `npx vitest run src/lib/server/players.spec.ts` → pass.
- [ ] **Step 5:** Commit `feat: erasePlayer anonymises a player and keeps their results`.

### Task 5: Carry `former` to the views; audit lines

**Files:** `src/lib/server/seasons.ts` (`seasonEntries`, `groupStandings`), `src/lib/server/matches.ts` (`seasonAudit`), `src/lib/matchCard.ts`, `src/lib/server/auditLog.ts`, specs

- [ ] **Step 1: Tests.** `seasons.spec.ts`: after `erasePlayer`, `seasonEntries` row has `former: true` (others false) and standings rows carry `former`. `matchCard` spec: a side whose person is `former` gets `former: true` and no `href`. `audit.spec.ts`: erase line reads `Erased a player · now Former player 1`; actor erased → `actorFormer: true`; a flag line whose reason was removed shows `reason removed`.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement.**
  - `seasonEntries`: add `former: sql<boolean>\`${players.erasedAt} is not null\`.mapWith(Boolean)`.
  - `groupStandings` rows: add `former: by.get(r.playerId)!.former`.
  - `matchCard.ts`: `Person` gains `former: boolean`; `side()` adds `former: !!person(id)?.former` and `href: person(id)?.former ? null : …`.
  - `seasonAudit`: add `actorFormer: sql<boolean>\`${players.erasedAt} is not null\`.mapWith(Boolean)`.
  - `auditLog.ts`: `LABEL.erase = 'Erase'`; `Change` gains `erased?: string`; `what` adds `after?.erased ? \`Erased a player · now ${name(after.erased)}\` : ''` and, for `r.action === 'flag' && !after?.flagReason`, `'reason removed'`; pass `actorFormer` through.
- [ ] **Step 4:** `npx vitest run` and `npm run check` → pass.
- [ ] **Step 5:** Commit `feat: mark erased players as former in standings, cards and the audit log`.

### Task 6: Former-player rendering (design `FeatFormer`)

**Files:** `src/lib/components/Avatar.svelte`, `StandingsTable.svelte`, `MatchCard.svelte`, routes that render `pb-pname` / `<Avatar>` for season people (audit log page, admin players/matches/groups/season, legends, player pages, match page)

- [ ] **Step 1: Avatar** gets `former = false`: when true render the design's placeholder:

```svelte
{#if former}
	<span class="pb-avatar pb-avatar-former" style:width="{size}px" style:height="{size}px" aria-hidden="true">
		<svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
	</span>
{:else if src}…
```

- [ ] **Step 2: StandingsTable:** `former` rows render a `<span class="pb-player">` (no link) with `<Avatar former>` and `class={['pb-player-name', r.former && 'pb-former']}`; never `is-me`.
- [ ] **Step 3: MatchCard:** `pb-match-p` gets `s.former && 'is-former'`, Avatar `former={s.former}`; no link when `href` is null (already).
- [ ] **Step 4: Name lists:** each `pb-pname` link for a season person becomes a span with `is-former` when `former` (audit actor uses `actorFormer`); player page headers show the italic muted name and `· Account erased. Results are kept.`
- [ ] **Step 5:** `npm run check` → 0 errors; `npx vitest run` → pass.
- [ ] **Step 6:** Commit `feat: render erased players as former (dashed avatar, muted name, no link)`.

### Task 7: Erase action and danger section (design `FeatEraseSection` / `Dialog` / `Done`)

**Files:** `src/lib/components/ConfirmButton.svelte`, `src/routes/seasons/[slug]/players/[id]/+page.server.ts`, `+page.svelte`, `src/lib/server/actions.spec.ts`

- [ ] **Step 1: Tests** in `actions.spec.ts`: `erase` as non-organizer → redirect to `/login/not-organizer`, nothing changed; as organizer with `confirm` ≠ name → 400 `Type the player's name to confirm.`; with the name → returns `{ message: 'Player erased. Their results now show as Former player 1.' }` and the player is erased; erasing again → 409.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement.**
  - `ConfirmButton`: `variant` and new `confirmVariant` accept `'danger'`; confirm button class `pb-btn-${confirmVariant}` (default `primary`).
  - page server: `load` adds `canErase: !!locals.user?.isOrganizer && !player.former` (display only; the action re-checks).

```ts
export const actions: Actions = {
	erase: async (event) => {
		const user = await organizerAction(event);
		const season = publicSeason(event.params.slug, user);
		const player = seasonEntries(season.id).find((e) => e.playerId === event.params.id);
		if (!player) error(404, 'Player not found');
		if (player.former) return fail(409, { message: 'This player is already erased.' });
		const typed = String((await event.request.formData()).get('confirm') ?? '').trim();
		if (typed !== player.displayName) return fail(400, { message: "Type the player's name to confirm." });
		const name = erasePlayer(player.playerId, user.id);
		return { message: `Player erased. Their results now show as ${name}.` };
	}
};
```

  - page: `pb-notice` for `form.message`; when `data.canErase` a section `aria-labelledby` "Erase player" + `Organizers only` badge, the bordered danger box text from the design, and `ConfirmButton variant="danger" confirmVariant="danger" label="Erase player…" title="Erase {name}?" confirmLabel="Erase player" confirmDisabled={typed.trim() !== name}` whose body lists Removed (Name and avatar / Discord link and logins / Their flag reasons), Kept (Their results, shown as "Former player"), "This can't be undone." and a `pb-field` text input `name="confirm"` labelled `Type {name} to confirm`, `autocomplete="off"`, `bind:value={typed}`.
- [ ] **Step 4:** `npx vitest run` and `npm run check` → pass.
- [ ] **Step 5:** Commit `feat: organizers erase a player from the player page`.

### Task 8: Privacy notice, footer, signup line (design `FeatSignup`, `FeatMobileSignup`)

**Files:** create `docs/privacy.md`, `src/routes/privacy/+page.server.ts`, `src/routes/privacy/+page.svelte`; modify `src/lib/rules.ts`, `src/routes/rules/+page.server.ts`, `src/routes/+layout.svelte`, `src/routes/seasons/[slug]/+page.svelte`, `src/lib/rules.spec.ts` (if present)

- [ ] **Step 1:** `rules.ts`: `export const renderDoc = (md: string) => marked.parse(md, { async: false });` and `renderRules = (md) => renderDoc(md.split(/^## Ideas for future seasons/m)[0])`.
- [ ] **Step 2:** `docs/privacy.md` sections: Who runs Poroleague (organizers of the Porobound Discord; contact an organizer on Discord), What we store, Why, How long (sessions ≤ 7 days; finished seasons kept as league history; Discord result/pairing posts removed when the season finishes), Your rights (access; erasure = anonymised, results stay as "Former player N"; mid-season Discord posts naming you removed within one month; ask an organizer), Backups (nightly, 14 kept plus off-box copies; only used to recover from a failure; erasures re-applied after a restore), Discord (third party, its own privacy policy).
- [ ] **Step 3:** `/privacy` route mirrors `/rules` (`?raw` import, `renderDoc`, same prose styles, `<title>Privacy · Poroleague</title>`).
- [ ] **Step 4:** Layout: `<footer class="pb-footer">` after `<main>` with `pb-footer-in`, `pb-footer-mark` "Poroleague", `<nav class="pb-footer-links" aria-label="Footer"><a href="/privacy">Privacy</a></nav>`; on phones `pb-footer-compact` via a media query in `app.css` (the tab bar sits below; add bottom padding so it isn't covered).
- [ ] **Step 5:** Signup line: `By signing up you agree to the <a href="/rules">rules</a> and the <a href="/privacy">privacy notice</a>.` Update `e2e/rules.spec.ts` (`league rules` link name → `rules`).
- [ ] **Step 6:** `npm run check` → 0 errors; commit `feat: privacy notice, site footer and the signup privacy line`.

### Task 9: e2e

**Files:** `e2e/fixtures.ts` (`erase: 'e2e-erase'`, `privacy: 'e2e-privacy'`), create `e2e/erase.spec.ts`, `e2e/privacy.spec.ts`

- [ ] **erase.spec.ts:** seed season `erase` with a result 1 vs 2 and a flag by 2. Organizer opens `/seasons/e2e-erase/players/erase-2`, clicks `Erase player…`; the `Erase player` confirm is disabled until `Type Erase 2 to confirm` is filled with `Erase 2`; confirms → status `Player erased. Their results now show as Former player N.`; the season standings, the match page and `/seasons/e2e-erase/audit` show `Former player N`, not `Erase 2`. Erase 2's session (`as('erase-2')`) now sees `Log in with Discord`. A non-organizer (`erase-1`) sees no `Erase player…` button.
- [ ] **privacy.spec.ts:** footer `Privacy` link from `/` → `/privacy` with heading `Privacy notice`; the signup panel links `privacy notice` to `/privacy`.
- [ ] Run `npm run test:e2e` → all pass. Commit `test: e2e for erasing a player and the privacy notice`.

### Task 10: Runbook, issue, PR

- [ ] `docs/erasure.md`: handling a request (run the action; delete their Discord posts by hand within a month; players with no seasons have no page: delete their row and sessions by hand in SQLite), end of season (purge the results/pairings/organizers webhook posts), after a backup restore (re-run `erasePlayer` for every `erase` audit row in the pre-restore DB newer than the backup; keep that DB until done).
- [ ] Full gate: `npm run check`, `npm run lint`, `npx vitest run`, `npm run test:e2e`.
- [ ] Commit `docs: erasure runbook`; push; open PR `Closes #78`.
