# Public API Implementation Plan

**Goal:** A read-only, anonymous JSON API at `/api/v1` exposing what the public pages already show, for third-party sites and tools.

**Architecture:** One `src/lib/server/api.ts` holds the DTO mappers and the response helper; every endpoint is a thin `+server.ts` under `src/routes/api/v1/` that loads through the existing server functions (`publicSeason`, `seasonEntries`, `groupStandings`, `seasonMatches`, `bracketMatches`, `cutState`, `legendMatches`/`legendStats`, `published`, `isVoid`, `isOverdue`) and maps to fixed shapes. No league rule is reimplemented. The contract is separate from page data, so UI changes can't break consumers; shape tests lock it. Docs live in `docs/api.md`, rendered at `/api` like `/privacy`. Abuse protection is a Cloudflare rate-limit rule, not app code.

**Tech Stack:** SvelteKit `+server.ts` (`json` from `@sveltejs/kit`), Drizzle, Vitest, Playwright `request` fixture. No new dependencies.

**Decisions (grill, 2026-10-31):**

- Consumers: third parties. Anonymous, `GET` only; other methods get SvelteKit's 405.
- Versioned `/api/v1`. Additive fields are fine within v1; removing or renaming anything means `/v2`.
- v1 scope: seasons list, season + groups/standings, matches, top cut, legends. Not in v1: player pages (derivable from matches), audit log (flag reasons are free user text), Elo leaderboard (organizer-only, #117).
- Player ref everywhere: `{ id, name, former }`. No avatar (its CDN URL embeds the Discord id), no Discord id. Erasure already rewrites name/avatar, so the API honours it for free.
- Visibility = public pages, viewer always `null`: no drafts, no soft-deleted seasons (404 `{ "error": "Season not found" }`); group matches only for rounds ≤ `publishedRound`; playoff matches and `/top-cut` only once the bracket is published.
- Dropped players: listed with `dropped: true`; their matches stay in `/matches` with `void: true`.
- Flags: `flag: "open" | "resolved" | null`, never the reason.
- `overdue`: derived with `isOverdue`, same as the match cards.
- Headers on every API response (`/api/v1` and below): `Access-Control-Allow-Origin: *`; `Cache-Control: public, max-age=60` on success, `no-store` on errors. No credentials, so `*` is safe.
- Errors: `{ "error": string }` with the HTTP status. No pagination (≈30 players a season).
- Dates `YYYY-MM-DD` (league timezone `Europe/Helsinki`), timestamps ISO 8601 UTC.
- Rate limit: Cloudflare Free rule on `porobound.com` (the zone's only free rule), `http.host eq "league.porobound.com" and starts_with(http.request.uri.path, "/api/")` (apex `porobound.com` is another site), 30 requests / 10 s per IP, block 10 s. Created after the API is on prod.
- Privacy: `docs/privacy.md` says the public data is also available through the API.

## Shapes

```ts
type PlayerRef = { id: string; name: string; former: boolean };

// GET /api/v1/seasons — newest first
type SeasonSummary = {
	slug: string;
	name: string;
	status: 'signup' | 'groups' | 'play' | 'topcut' | 'finished';
	startDate: string | null;
	deadline: string | null;
};

// GET /api/v1/seasons/:slug
type SeasonDetail = SeasonSummary & {
	roundsPerWeek: number;
	publishedRound: number;
	topCutSize: number | null;
	topCutDate: string | null;
	players: (PlayerRef & { group: number | null; dropped: boolean })[];
	groups: {
		group: number;
		name: string; // "Group A"
		standings: {
			rank: number;
			player: PlayerRef;
			played: number;
			wins: number;
			draws: number;
			losses: number;
			points: number;
			gameWins: number;
			gameLosses: number;
			gameWinPct: number;
			unresolvedTie: boolean;
		}[];
	}[]; // empty before groups are locked
};

// GET /api/v1/seasons/:slug/matches — group stage (published rounds), then playoffs (if published)
type MatchDto = {
	id: number;
	stage: 'group' | 'playoff';
	group: number | null;
	round: number;
	week: number | null; // week: group stage only
	p1: PlayerRef;
	p2: PlayerRef;
	result: {
		p1Games: number;
		p2Games: number;
		games: ('1' | '2' | 'D')[] | null;
		p1Legend: string | null;
		p2Legend: string | null;
		diceWinner: string | null; // player id
		reportedAt: string;
	} | null;
	walkover: string | null; // playoff: player id that advanced without playing
	void: boolean;
	overdue: boolean;
	flag: 'open' | 'resolved' | null;
};

// GET /api/v1/seasons/:slug/top-cut — 404 until published
type TopCut = {
	champion: PlayerRef | null;
	rounds: {
		name: string; // "Final", "Semifinals", …
		slots: {
			p1: PlayerRef | null;
			p2: PlayerRef | null;
			bye: boolean;
			winner: string | null;
			matchId: number | null;
		}[];
	}[];
};

// GET /api/v1/seasons/:slug/legends — same exclusions as the legends page
type LegendRow = {
	legend: string;
	picks: number;
	players: number;
	mirrors: number;
	wins: number;
	draws: number;
	losses: number;
	gameWins: number;
	gameLosses: number;
	matchWinPct: number | null;
	gameWinPct: number | null; // null under MIN_RATED non-mirror matches
};
```

## Files

- Create `src/lib/server/api.ts`: `apiSeason(slug)` (live, non-draft season or `null`), `notFound(message)` (`json({ error }, { status: 404 })`), and one mapper per shape.
- Modify `src/hooks.server.ts`: for paths under `/api/v1/`, skip the session lookup (anonymous) and set the two headers on whatever `resolve` returns, 404s and 405s included.
- Create `src/lib/server/api.spec.ts`: shape and visibility tests on the handlers.
- Create `src/routes/api/v1/[...rest]/+server.ts` (unknown API paths → JSON 404).
- Create `src/routes/api/v1/seasons/+server.ts`, `.../[slug]/+server.ts`, `.../[slug]/matches/+server.ts`, `.../[slug]/top-cut/+server.ts`, `.../[slug]/legends/+server.ts`.
- Create `e2e/api.spec.ts`. Add `api: 'e2e-api'` to `SEASONS` in `e2e/fixtures.ts`.
- Create `docs/api.md`, `src/routes/api/+page.server.ts`, `src/routes/api/+page.svelte`.
- Modify `src/routes/+layout.svelte` (footer link), `docs/privacy.md`, `docs/spec.md` (Public API section, roadmap 12), `docs/ops.md` (rate-limit rule), `e2e/mobile.spec.ts` (`/api` page).

## Issue A: API foundation with seasons endpoints

### Task A1: Response helper and season lookup

- [x] `hooks.server.ts`: `/api/v1/` requests get `locals.user = null` without reading the cookie, and `Access-Control-Allow-Origin: *` + `Cache-Control: public, max-age=60` on the response.
- [x] `apiSeason(slug)`: same live/non-draft query as `getSeason`, returning `null` instead of throwing; handlers do `if (!season) return notFound('Season not found')`.
- [x] Test: a draft, a soft-deleted and an unknown slug each give 404 with `{ error: 'Season not found' }`. Headers are checked in e2e (A4), since the hook doesn't run in handler unit tests.

### Task A2: `GET /api/v1/seasons`

- [x] `allSeasons()` minus drafts, mapped to `SeasonSummary`.
- [x] Test: drafts and deleted seasons are absent, newest first, exact key set (`Object.keys` snapshot) so additions are deliberate.

### Task A3: `GET /api/v1/seasons/:slug`

- [x] Season fields + `players` from `seasonEntries` + `groups` from `groupStandings` when `hasSchedule(status)`; `rank` = row index + 1, `gameWinPct` = row `gwp`.
- [x] Tests: standings order and numbers match `groupStandings` for a seeded group; a dropped player is in `players` with `dropped: true` and not in `standings`; an erased player shows as `Former player …` with `former: true`; no `avatar`/`discordId` key anywhere in the JSON (string search on `JSON.stringify`).

### Task A4: e2e

- [x] `e2e/api.spec.ts`: seed `api` season (`seedSeason('api', { publishedRound: 2 })`) plus a draft; via `request`: `/api/v1/seasons` lists the season and not the draft, `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=60` on 200 and 404, `POST` gives 405.
- [x] `npm run check`, `npx vitest run`, `npm run test:e2e` green.

## Issue B: Matches, top cut and legends endpoints

### Task B1: `GET /api/v1/seasons/:slug/matches`

- [ ] `published(seasonMatches(id), publishedRound)` mapped with a `cardContext`-equivalent context (`droppedIds`, `currentWeek`, `reportingClosed`, `liveState`) for `void`/`overdue`; then `bracketMatches(id)` when `cutState(season).published`. `games` split from the stored string; `flag` = `flaggedBy ? (flagResolvedAt ? 'resolved' : 'open') : null`.
- [ ] Regression test (break once to see it fail): with `publishedRound: 2`, no round-3 match appears.
- [ ] Tests: flagged match has `flag: 'open'` and no `flagReason` text in the JSON; resolved → `'resolved'`; dropped player's match `void: true`; an unreported past-week match `overdue: true`; playoff rows absent until the bracket is published, present after.

### Task B2: `GET /api/v1/seasons/:slug/top-cut`

- [ ] 404 `{ error: 'No top cut yet' }` until `cutState(season).published`; then rounds via `roundName`, slots mapped to `PlayerRef`s, `champion`.
- [ ] Tests: 404 before publish; after a finished final, `champion` is the winner and round names run `…`, `Final`.

### Task B3: `GET /api/v1/seasons/:slug/legends`

- [ ] `legendStats(legendMatches(seasonMatches(id), droppedIds(entries)))` mapped to `LegendRow`, sorted by picks desc then legend; percentages via `matchWinPct`/`gameWinPct`.
- [ ] Tests: void matches excluded; a legend under 5 non-mirror matches has `null` percentages; mirrors counted in `picks` and `mirrors`, not in W-D-L.

### Task B4: e2e

- [ ] Extend `e2e/api.spec.ts`: round 3 not in `/matches` for `publishedRound: 2`; a seeded flagged result shows `flag: 'open'` without its reason; `/top-cut` 404s.
- [ ] Full test suite green.

## Issue C: Public API docs page

### Task C1: `docs/api.md`

- [ ] Intro (read-only, anonymous, JSON, cached 60 s, rate limited, versioning promise), then one section per endpoint: path, example response, field notes (visibility rules, `former`, `void`/`overdue`/`flag`, date/timezone formats, null cases).

### Task C2: `/api` page

- [ ] `src/routes/api/+page.server.ts` renders `docs/api.md?raw` with `renderDoc` (same as privacy); page copies `src/routes/privacy/+page.svelte` with title `API · Poroleague`.
- [ ] Footer link "API" next to Privacy in `src/routes/+layout.svelte`.
- [ ] Privacy: one line under what's public: results, standings and the change log are on the site, and the public data is also available through the API (no avatars or Discord ids).
- [ ] e2e: footer link opens `/api` with heading; add `/api` to `e2e/mobile.spec.ts` pages.
- [ ] `docs/spec.md`: "Public API" section (decisions above, short) and roadmap entry 12.

## Issue D: Rate-limit the public API at Cloudflare

Runs after A–C are promoted to prod.

- [ ] Create the rule on zone `porobound.com` (`http_ratelimit` phase entrypoint, none exists yet): expression `http.host eq "league.porobound.com" and starts_with(http.request.uri.path, "/api/")` (apex `porobound.com` is another site), characteristics `ip.src` + `cf.colo.id`, 30 requests / 10 s, block 10 s. Confirm with the owner before writing.
- [ ] Check: a burst of 40 requests to `/api/v1/seasons` gets 429s after ~30; normal page loads are unaffected.
- [ ] `docs/ops.md`: the rule, why, and that it is the zone's only Free-plan rate-limit rule.
