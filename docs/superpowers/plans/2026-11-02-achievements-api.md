# Achievements and Cosmetics in the Public API Implementation Plan (#144)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API consumers (the future Discord bot first) see a player's earned achievements and every player's equipped title, badge and frame. The site's visibility rules apply unchanged.

**Architecture:** Every player object the API already returns (`playerRef` in `src/lib/server/api.ts`) gains `title`, `badge` and `frame`. Each is an `Achievement` object (`id, name, title, tier, icon`) or `null`. A new endpoint, `GET /api/v1/players/{id}`, returns that player object plus `achievements`, the earned list from #142's `player_achievements`, newest first. Icons are absolute URLs built from `event.url.origin` (`ORIGIN` in prod), so the DTO builders take an `origin` argument. The OpenAPI spec gets the new schemas and path, and the contract tests validate real responses as they already do. No migration.

**Tech Stack:** SvelteKit 3, Drizzle + better-sqlite3, Vitest + Ajv (contract tests), Playwright. No new dependencies.

**Stack position:** #141 → #142 → #143 → **#144**. Branch `feat/144-achievements-api`, in a scratchpad worktree. PR title `feat(api): achievements and cosmetics in the public API`, body `Closes #144`.

---

## Decisions this plan locks in

- **Where achievements live: a new `GET /players/{id}`.** Embedding the earned list in every player object would put up to 187 rows × every player in `/seasons/{slug}`, and the lists are per player anyway. The spec's "Not exposed: player pages (derivable)" becomes "Not exposed: career stats (derivable from the season endpoints)". The new endpoint has no stats, only identity, cosmetics and achievements, which you can't derive.
- **`/players/{id}` 404s** (`Player not found`) unless the player is entered in at least one non-draft, non-deleted season. That's the career page's rule (`playerSeasons` empty → 404), so organizer-only and never-played accounts stay invisible.
- **Visibility:** #142 awards only from published results (`isPublished`), so an earned row never reveals a holiday-hidden result. A unit test pins it: a reported but unpublished round shows nothing until the week is published. The endpoint has no season field, so an achievement earned in a season that was later soft-deleted (award-only rows stay, as on the site) doesn't leak that season's slug.
- **Shape:** the three cosmetic fields are flat on the player object (issue: "on player objects"), each `Achievement | null`. Consumers read `title.title` as the text, `badge.icon` for the badge, and `frame.tier` for the ring colour. Unknown ids (a renamed legend) are `null` or left out, as on the site.
- **Icons are absolute** (`https://league.porobound.com/achievements/…`), so a bot can drop them into an embed. `event.url.origin` is already how the app builds absolute links (Discord embeds).
- **Former players:** #143 clears their cosmetics on erasure. Their earned achievements stay listed, like their results and the career page.
- **Dev data:** none new (issue). #142's and #143's `db:reseed-dev` covers it.

## File structure

| File                                                                           | Responsibility                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/api.ts` (modify)                                               | `achievementDto`, cosmetics on `playerRef`, `origin` threading, `playerDetail`                                                                                                  |
| `src/routes/api/v1/seasons/[slug]/+server.ts`, `matches/`, `top-cut/` (modify) | pass `url.origin`                                                                                                                                                               |
| `src/routes/api/v1/players/[id]/+server.ts` (create)                           | the new endpoint                                                                                                                                                                |
| `src/lib/server/openapi.json` (modify)                                         | `Tier`, `Achievement`, `EarnedAchievement`, `PlayerDetail`, cosmetics on `PlayerRef` and season players, `/players/{id}`, `playerId` parameter, `Players` tag, conventions text |
| `src/lib/server/api.spec.ts`, `src/lib/server/openapi.spec.ts` (modify)        | behaviour and contract                                                                                                                                                          |
| `e2e/api.spec.ts` (modify)                                                     | over HTTP: headers, absolute icon resolves                                                                                                                                      |
| `docs/spec.md` (modify)                                                        | Public API section; #143's "not in the API" line                                                                                                                                |

---

### Task 1: Prerequisite check (#143 landed)

- [ ] **Step 1: Rebase on `main` once #143 is merged, then check**

```bash
grep -n "titleAchievement" src/lib/server/db/schema.ts src/lib/server/seasons.ts
grep -n "export function look\|export type Equipped\|export const NOTHING" src/lib/league/cosmetics.ts
grep -n "seedCosmetics\|seedAchievements" e2e/db.ts
ls drizzle/0009_*.sql
```

Expected: every grep hits. `seasonEntries` selects the three columns. There's nothing to commit.

---

### Task 2: Cosmetics on every player object

**Files:**

- Modify: `src/lib/server/api.ts`, `src/routes/api/v1/seasons/[slug]/+server.ts`, `src/routes/api/v1/seasons/[slug]/matches/+server.ts`, `src/routes/api/v1/seasons/[slug]/top-cut/+server.ts`, `src/lib/server/openapi.json`
- Test: `src/lib/server/api.spec.ts`, `src/lib/server/openapi.spec.ts`

- [ ] **Step 1: Pass a URL in the test helpers.** In `api.spec.ts`:

```ts
const call = async (get: (e: never) => Response | Promise<Response>, params = {}) => {
	const res = await get({ params, url: new URL('http://localhost/api/v1/x') } as never);
	return { status: res.status, body: await res.json() };
};
// A player object with nothing equipped.
const ref = (id: string, name: string, former = false) => ({
	id,
	name,
	former,
	title: null,
	badge: null,
	frame: null
});
```

Replace each `toEqual` literal `{ id: 'pN', name: 'Player N', former: false }` with `ref('pN', 'Player N')`: the standings row in "ranks the group…", the champion and both slot players in "shows the bracket…". For the season `players` items, spread it: `{ ...ref('p1', 'Player 1'), group: null, dropped: false }`, in "has no groups…" and "lists a dropped player…". The `toMatchObject` checks stay as they are. In `openapi.spec.ts`'s `check`, do the same: `await get({ params, url: new URL('http://localhost/api/v1/x') } as never)`.

- [ ] **Step 2: Write the failing tests** (append to `api.spec.ts`; import `playerAchievements` from the schema)

```ts
describe('cosmetics on player objects', () => {
	const AHRI = {
		id: 'legend-ahri-master',
		name: 'Ahri Master',
		title: 'Ahri Master',
		tier: 'gold',
		icon: 'http://localhost/achievements/champions/ahri.png'
	};
	beforeEach(() => {
		seedPlayers(2);
		const s = seedSeason({ status: 'play', publishedRound: 1 });
		seedEntries(s.id, ['p1', 'p2'], 1);
		seedMatch({ seasonId: s.id, group: 1, round: 1, p1Id: 'p1', p2Id: 'p2' });
		db.update(players)
			.set({
				titleAchievement: 'legend-ahri-master',
				badgeAchievement: 'legend-ahri-master',
				frameAchievement: 'legend-renamed-master'
			})
			.where(eq(players.id, 'p1'))
			.run();
	});

	it('every endpoint sends the equipped title, badge and frame, icons absolute', async () => {
		const { body } = await season('s1');
		const p1 = { id: 'p1', name: 'Player 1', former: false, title: AHRI, badge: AHRI, frame: null };
		expect(body.players[0]).toEqual({ ...p1, group: 1, dropped: false });
		expect(
			body.groups[0].standings.find((r: { player: { id: string } }) => r.player.id === 'p1').player
		).toEqual(p1);
		expect((await matchesOf())[0].p1).toEqual(p1);
		expect(body.players[1]).toEqual({ ...ref('p2', 'Player 2'), group: 1, dropped: false });
	});

	it('an unknown equipped id is null, like on the site', async () => {
		const { body } = await season('s1');
		expect(body.players[0].frame).toBeNull(); // legend-renamed-master isn't in the list
	});
});
```

(`matchesOf` is the file's existing helper for `/matches` of `s1`. If it's scoped inside the matches `describe`, hoist it to file level.)

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run src/lib/server/api.spec.ts src/lib/server/openapi.spec.ts`
Expected: FAIL, the player objects have no `title`/`badge`/`frame`.

- [ ] **Step 4: Implement in `src/lib/server/api.ts`**

```ts
import { achievementById, type Achievement } from '#lib/league/achievements.ts';
import { NOTHING, type Equipped } from '#lib/league/cosmetics.ts';

// Icons are site paths; the API sends absolute URLs so a bot can embed them.
export const achievementDto = (a: Achievement, origin: string) => ({
	id: a.id,
	name: a.name,
	title: a.title,
	tier: a.tier,
	icon: new URL(a.icon, origin).href
});
// An equipped slot. An id no longer in the list is null, as on the site.
const equipped = (id: string | null, origin: string) => {
	const a = id ? achievementById.get(id) : undefined;
	return a ? achievementDto(a, origin) : null;
};

type Person = { playerId: string; displayName: string; former: boolean } & Equipped;
export const playerRef = (p: Person, origin: string) => ({
	id: p.playerId,
	name: p.displayName,
	former: p.former,
	title: equipped(p.titleAchievement, origin),
	badge: equipped(p.badgeAchievement, origin),
	frame: equipped(p.frameAchievement, origin)
});
```

Thread `origin` through the rest:

- `people(seasonId: number, origin: string)`: `ref` returns `playerRef(e, origin)`, and for an unknown id `playerRef({ playerId: id, displayName: 'Unknown', former: false, ...NOTHING }, origin)`.
- `seasonDetail(s: Season, origin: string)`: use `const { list, ref } = people(s.id, origin);` in place of its own `seasonEntries` call. Players become `{ ...playerRef(e, origin), group: …, dropped: e.dropped }`. The standings' `player:` becomes `ref(r.playerId)`.
- `seasonMatchList(s: Season, origin: string)` and `topCut(s: Season, origin: string)` call `people(s.id, origin)`.
- `legendList` and `seasonList` don't change (no players).

In the three route handlers, take `url` and pass `url.origin`, e.g. `export const GET: RequestHandler = ({ params, url }) => { … json(seasonDetail(season, url.origin)) … }`.

- [ ] **Step 5: Document it in `openapi.json`.** Under `components.schemas` add:

```json
"Tier": {
	"type": "string",
	"enum": ["bronze", "silver", "gold"],
	"description": "Achievement tier: Player = bronze, Expert = silver, Master = gold."
},
"Achievement": {
	"type": "object",
	"description": "An achievement from the site's fixed list. Ids never change.",
	"additionalProperties": false,
	"required": ["id", "name", "title", "tier", "icon"],
	"properties": {
		"id": { "type": "string", "examples": ["legend-ahri-master"] },
		"name": { "type": "string", "examples": ["Ahri Master"] },
		"title": {
			"type": "string",
			"description": "The text shown with the player's name when this is their equipped title.",
			"examples": ["Ahri Master"]
		},
		"tier": {
			"oneOf": [{ "$ref": "#/components/schemas/Tier" }, { "type": "null" }],
			"description": "`null` for a one-off achievement."
		},
		"icon": {
			"type": "string",
			"format": "uri",
			"description": "Absolute URL of the icon (PNG).",
			"examples": ["https://league.porobound.com/achievements/champions/ahri.png"]
		}
	}
}
```

Add these to `PlayerRef.properties`, and add `"title", "badge", "frame"` to its `required`:

```json
"title": {
	"oneOf": [{ "$ref": "#/components/schemas/Achievement" }, { "type": "null" }],
	"description": "Equipped title: show its `title` with the name. `null` if none."
},
"badge": {
	"oneOf": [{ "$ref": "#/components/schemas/Achievement" }, { "type": "null" }],
	"description": "Equipped badge: show its `icon` next to the name. `null` if none."
},
"frame": {
	"oneOf": [{ "$ref": "#/components/schemas/Achievement" }, { "type": "null" }],
	"description": "Equipped avatar frame: a ring in its `tier` colour (always a tiered achievement). `null` if none."
}
```

Add the same three properties, and the same three `required` entries, to the `SeasonDetail.players.items` object. Update `info.description`'s Conventions bullet to: Players appear as `{ "id", "name", "former", "title", "badge", "frame" }`. `title`, `badge` and `frame` are what the player equipped from their achievements (each an achievement object, or `null`); show `title.title`, `badge.icon` and a `frame.tier` ring. Erased players have none.

- [ ] **Step 6: Make the contract tests cover the non-null shape.** In `openapi.spec.ts`'s `beforeEach`, before `erasePlayer('p9', 'org')`, add:

```ts
db.update(players)
	.set({
		titleAchievement: 'first-blood',
		badgeAchievement: 'champion',
		frameAchievement: 'legend-jinx-master'
	})
	.where(eq(players.id, 'p1'))
	.run();
```

(Display doesn't check ownership. Task 3 adds the earned rows the new endpoint needs.)

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/server/api.spec.ts src/lib/server/openapi.spec.ts && npm run check`
Expected: PASS. "closes every object schema" and "responses match the spec" are both green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/api.ts src/routes/api src/lib/server/openapi.json src/lib/server/api.spec.ts src/lib/server/openapi.spec.ts
git commit -m "feat(api): equipped cosmetics on player objects"
```

---

### Task 3: `GET /players/{id}` with earned achievements

**Files:**

- Modify: `src/lib/server/api.ts`, `src/lib/server/openapi.json`
- Create: `src/routes/api/v1/players/[id]/+server.ts`
- Test: `src/lib/server/api.spec.ts`, `src/lib/server/openapi.spec.ts`

- [ ] **Step 1: Write the failing tests** (append to `api.spec.ts`; import `GET as playerGet` from `'../../routes/api/v1/players/[id]/+server.ts'`, plus `publishWeek` from seasons)

```ts
describe('GET /api/v1/players/:id', () => {
	const player = (id: string) => call(playerGet, { id });
	const D = (day: number) => new Date(Date.UTC(2026, 0, day));
	const earn = (playerId: string, achievementId: string, day: number) =>
		db
			.insert(playerAchievements)
			.values({ playerId, achievementId, unlockedAt: D(day), seasonId: null })
			.run();

	it('404s unknown players and players in no public season', async () => {
		seedPlayers(3);
		seedEntries(seedSeason({ slug: 'draft' }).id, ['p1']); // p1: only a draft
		const gone = seedSeason({ slug: 'gone', status: 'play' });
		seedEntries(gone.id, ['p3']); // p3: only a deleted season
		deleteSeason(gone, 'p3');
		for (const id of ['p1', 'p2', 'p3', 'nope'])
			expect(await player(id)).toEqual({ status: 404, body: { error: 'Player not found' } });
	});

	it('lists earned achievements newest first, with cosmetics and absolute icons', async () => {
		seedPlayers(1);
		seedEntries(seedSeason({ status: 'play' }).id, ['p1']);
		earn('p1', 'first-blood', 1);
		earn('p1', 'legend-ahri-player', 5);
		earn('p1', 'legend-renamed-player', 9); // no longer in the list: left out
		db.update(players).set({ badgeAchievement: 'first-blood' }).where(eq(players.id, 'p1')).run();
		const { status, body } = await player('p1');
		expect(status).toBe(200);
		expect(body).toEqual({
			id: 'p1',
			name: 'Player 1',
			former: false,
			title: null,
			badge: {
				id: 'first-blood',
				name: 'First Blood',
				title: 'First Blood',
				tier: null,
				icon: 'http://localhost/achievements/items/first-blood.png'
			},
			frame: null,
			achievements: [
				{
					id: 'legend-ahri-player',
					name: 'Ahri Player',
					title: 'Ahri Player',
					tier: 'bronze',
					icon: 'http://localhost/achievements/champions/ahri.png',
					unlockedAt: D(5).toISOString()
				},
				{
					id: 'first-blood',
					name: 'First Blood',
					title: 'First Blood',
					tier: null,
					icon: 'http://localhost/achievements/items/first-blood.png',
					unlockedAt: D(1).toISOString()
				}
			]
		});
	});

	// Regression guard: nothing earned from a result the site still hides (holiday early play).
	it('shows nothing from an unpublished round until its week is published', async () => {
		seedPlayers(2);
		db.insert(players).values({ id: 'org', displayName: 'Org' }).run();
		const s = seedSeason({ status: 'play', publishedRound: 1, roundsPerWeek: 1 });
		seedEntries(s.id, ['p1', 'p2'], 1);
		const m = seedMatch({ seasonId: s.id, group: 1, round: 2, p1Id: 'p1', p2Id: 'p2' });
		saveReport(m, 'p1', {
			games: null,
			p1Games: 2,
			p2Games: 0,
			p1Legend: 'Ahri',
			p2Legend: 'Annie',
			diceWinnerId: 'p1'
		});
		expect((await player('p1')).body.achievements).toEqual([]);
		publishWeek(s.id, 2, [2, 2], 'org');
		expect((await player('p1')).body.achievements.map((a: { id: string }) => a.id)).toContain(
			'first-blood'
		);
	});

	it('keeps an erased player’s achievements but no cosmetics', async () => {
		seedPlayers(2);
		seedEntries(seedSeason({ status: 'finished' }).id, ['p1', 'p2']);
		earn('p1', 'champion', 3);
		db.update(players).set({ titleAchievement: 'champion' }).where(eq(players.id, 'p1')).run();
		erasePlayer('p1', 'p2');
		const { body } = await player('p1');
		expect(body).toMatchObject({ former: true, title: null, badge: null, frame: null });
		expect(body.achievements.map((a: { id: string }) => a.id)).toEqual(['champion']);
	});
});
```

In the publish test, check #142's `publishWeek` call site: if #142 made `publishWeek` award (its plan says so), the test passes as written. If the award lives in the route action instead, call `awardSeason(db, s.id)` from `#lib/server/achievements.ts` after `publishWeek`, and note it in the PR.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/server/api.spec.ts`
Expected: FAIL, cannot resolve the players route.

- [ ] **Step 3: `playerDetail` in `src/lib/server/api.ts`**

```ts
import { and, eq, isNull, ne } from 'drizzle-orm';
import { ACHIEVEMENTS } from '#lib/league/achievements.ts';
import { db } from '#lib/server/db/index.ts';
import { entries, former, playerAchievements, players, seasons } from '#lib/server/db/schema.ts';

const ORDER = new Map(ACHIEVEMENTS.map((a, i) => [a.id, i]));

// The career page's rule: a player is public once they're in a non-draft season that isn't deleted.
// Earned rows come only from published results (#142), so none reveals a hidden result.
export function playerDetail(id: string, origin: string) {
	const listed = db
		.select({ id: entries.playerId })
		.from(entries)
		.innerJoin(seasons, eq(entries.seasonId, seasons.id))
		.where(and(eq(entries.playerId, id), isNull(seasons.deletedAt), ne(seasons.status, 'draft')))
		.get();
	if (!listed) return null;
	const p = db
		.select({
			playerId: players.id,
			displayName: players.displayName,
			former: former(),
			titleAchievement: players.titleAchievement,
			badgeAchievement: players.badgeAchievement,
			frameAchievement: players.frameAchievement
		})
		.from(players)
		.where(eq(players.id, id))
		.get()!;
	const achievements = db
		.select()
		.from(playerAchievements)
		.where(eq(playerAchievements.playerId, id))
		.all()
		.flatMap((r) => {
			const a = achievementById.get(r.achievementId);
			return a ? [{ a, at: r.unlockedAt }] : [];
		})
		.sort((x, y) => y.at.getTime() - x.at.getTime() || ORDER.get(x.a.id)! - ORDER.get(y.a.id)!)
		.map(({ a, at }) => ({ ...achievementDto(a, origin), unlockedAt: at.toISOString() }));
	return { ...playerRef(p, origin), achievements };
}
```

(Merge these imports with the file's existing ones. `achievementById` is already imported from Task 2.)

- [ ] **Step 4: The route** `src/routes/api/v1/players/[id]/+server.ts`

```ts
import { json } from '@sveltejs/kit';
import { notFound, playerDetail } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	const player = playerDetail(params.id, url.origin);
	return player ? json(player) : notFound('Player not found');
};
```

- [ ] **Step 5: Document it.** In `openapi.json`, add `{ "name": "Players" }` to `tags` after `Legends`. Add `components.parameters.playerId`:

```json
"playerId": {
	"name": "id",
	"in": "path",
	"required": true,
	"description": "A player's `id`, from any player object.",
	"schema": { "type": "string" },
	"example": "k3x9"
}
```

Add these schemas:

```json
"EarnedAchievement": {
	"type": "object",
	"description": "An achievement the player earned. Earned once, never taken away.",
	"additionalProperties": false,
	"required": ["id", "name", "title", "tier", "icon", "unlockedAt"],
	"properties": {
		"id": { "type": "string", "examples": ["legend-ahri-player"] },
		"name": { "type": "string", "examples": ["Ahri Player"] },
		"title": { "type": "string", "description": "Its title text, if equipped as one.", "examples": ["Ahri Player"] },
		"tier": {
			"oneOf": [{ "$ref": "#/components/schemas/Tier" }, { "type": "null" }],
			"description": "`null` for a one-off achievement."
		},
		"icon": { "type": "string", "format": "uri", "description": "Absolute URL of the icon (PNG)." },
		"unlockedAt": {
			"type": "string",
			"format": "date-time",
			"description": "When the result or season event that earned it happened (UTC)."
		}
	}
},
"PlayerDetail": {
	"type": "object",
	"additionalProperties": false,
	"required": ["id", "name", "former", "title", "badge", "frame", "achievements"],
	"properties": {
		"id": { "type": "string", "examples": ["k3x9"] },
		"name": { "type": "string", "examples": ["Alice"] },
		"former": { "type": "boolean", "description": "An erased player." },
		"title": { "oneOf": [{ "$ref": "#/components/schemas/Achievement" }, { "type": "null" }], "description": "Equipped title." },
		"badge": { "oneOf": [{ "$ref": "#/components/schemas/Achievement" }, { "type": "null" }], "description": "Equipped badge." },
		"frame": { "oneOf": [{ "$ref": "#/components/schemas/Achievement" }, { "type": "null" }], "description": "Equipped avatar frame." },
		"achievements": {
			"type": "array",
			"description": "Earned achievements, newest first.",
			"items": { "$ref": "#/components/schemas/EarnedAchievement" }
		}
	}
}
```

Under `paths`, before `/openapi.json`, add:

```json
"/players/{id}": {
	"parameters": [{ "$ref": "#/components/parameters/playerId" }],
	"get": {
		"tags": ["Players"],
		"operationId": "getPlayer",
		"summary": "Get a player",
		"description": "The player's equipped cosmetics and earned achievements, newest first.\n\n- Achievements come only from published results and season events, and are never taken away.\n- Career stats aren't here: add them up from the season endpoints.",
		"responses": {
			"200": {
				"description": "The player.",
				"content": { "application/json": { "schema": { "$ref": "#/components/schemas/PlayerDetail" } } }
			},
			"404": {
				"description": "`Player not found`: no such player, or they're in no season the API shows.",
				"content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } }
			}
		}
	}
}
```

- [ ] **Step 6: Contract-test it.** In `openapi.spec.ts`, import `GET as playerGet` from `'../../routes/api/v1/players/[id]/+server.ts'` and `playerAchievements` from the schema. In `beforeEach`, after Task 2's update, add `db.insert(playerAchievements).values({ playerId: 'p1', achievementId: 'legend-jinx-master', unlockedAt: new Date(), seasonId: null }).onConflictDoNothing().run();`. Then add:

```ts
it('/players/{id}', async () => {
	const { body } = await check('/players/{id}', playerGet, { id: 'p1' });
	expect(body.achievements.length).toBeGreaterThan(0);
	expect(body.title).not.toBeNull();
	await check('/players/{id}', playerGet, { id: 'p9' }); // erased: former, no cosmetics
	expect((await check('/players/{id}', playerGet, { id: 'nope' })).status).toBe(404);
});
```

"documents every API route and nothing else" now needs `/players/{id}` in `paths`, which Step 5 added.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/server/api.spec.ts src/lib/server/openapi.spec.ts && npm run check`
Expected: PASS. Break it once: in `playerDetail`, drop `ne(seasons.status, 'draft')`, and "404s … players in no public season" must FAIL. Restore it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/api.ts src/routes/api/v1/players src/lib/server/openapi.json src/lib/server/api.spec.ts src/lib/server/openapi.spec.ts
git commit -m "feat(api): player endpoint with earned achievements"
```

---

### Task 4: e2e over HTTP

**Files:** Modify `e2e/api.spec.ts`.

- [ ] **Step 1: Write the test.** Import `seedAchievements, seedCosmetics` from `./db.ts` and `player` from `./fixtures.ts`. In `beforeAll`, add:

```ts
seedAchievements(player('api', 1), ['first-blood', 'legend-jinx-master']);
seedCosmetics(player('api', 1), {
	title: 'legend-jinx-master',
	badge: 'first-blood',
	frame: 'legend-jinx-master'
});
```

Then:

```ts
test('a player has achievements and cosmetics, with icons that load', async ({ request }) => {
	const res = await request.get(`/api/v1/players/${player('api', 1)}`);
	expect(res.status()).toBe(200);
	shared(res);
	const body = await res.json();
	expect(body.achievements.map((a: { id: string }) => a.id)).toEqual(
		expect.arrayContaining(['first-blood', 'legend-jinx-master'])
	);
	expect(body.frame.tier).toBe('gold');
	expect(body.badge.icon).toMatch(
		/^http:\/\/localhost:\d+\/achievements\/items\/first-blood\.png$/
	);
	const icon = await request.get(body.badge.icon);
	expect(icon.status()).toBe(200);
	expect(icon.headers()['content-type']).toBe('image/png');

	const season = await (await request.get(`${API}/${SEASONS.api}`)).json();
	expect(season.players.find((p: { id: string }) => p.id === player('api', 1)).badge.id).toBe(
		'first-blood'
	);
});
```

Add `'/api/v1/players/nope'` to the paths in "misses answer in JSON with the same headers".

- [ ] **Step 2: Run it and confirm it passes**

Run: `npm run test:e2e -- e2e/api.spec.ts`
Expected: PASS. The miss list now covers the player 404, with `no-store`.

- [ ] **Step 3: Commit**

```bash
git add e2e/api.spec.ts
git commit -m "test(api): player endpoint over HTTP"
```

---

### Task 5: Docs

**Files:** Modify `docs/spec.md`.

- [ ] **Step 1: Public API section.**
  - The endpoints list gains `/players/{id}` (equipped cosmetics plus earned achievements, newest first; 404 unless the player is in a public season).
  - "Not exposed" becomes: career stats (derivable from the season endpoints), audit log (flag reasons), the Elo leaderboard (organizers only).
  - Add a bullet: player objects carry `title`/`badge`/`frame` (achievement objects or `null`). Icons are absolute URLs from the request origin (`ORIGIN` in prod). Nothing earned comes from an unpublished result.
- [ ] **Step 2: Cosmetics and Achievements sections.** In #143's "Profile cosmetics" and #142's "Achievements", change "not in the API" to "in the API (`/players/{id}`, player objects)". Leave "not in Discord" as it is.
- [ ] **Step 3:** Run `npm run lint`. Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add docs/spec.md
git commit -m "docs(api): document achievements and cosmetics in the API"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full suite**

```bash
npm run lint
npm run check
npx vitest run
npm run test:e2e
```

Expected: all green. In the contract tests: the spec is valid OpenAPI 3.1, every object is closed, routes equal `paths`, and real responses validate.

- [ ] **Step 2: Spec coverage walk.**
  - Earned achievements per player (id, name, tier, unlockedAt, icon URL): T3.
  - Equipped title, badge and frame wherever players appear: T2 (season, standings, matches, top cut).
  - OpenAPI plus contract tests: T2 and T3.
  - Holiday visibility: T3's unpublished-round test.
  - No new dev script: `db:reseed-dev` from #142/#143 already equips and awards.
- [ ] **Step 3: By hand.** Start a dev server from the worktree on another port. Open `/api` and check that the Players tag shows `GET /players/{id}`, that "Try it" against a reseeded fake player returns achievements, and that the icon URLs open. Check `/api` still fits a phone (`mobile.spec.ts` covers it).
- [ ] **Step 4: Ask the owner before pushing.** Suggest `/code-review` before merge.
