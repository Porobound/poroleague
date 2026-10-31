# Scalar API Reference Implementation Plan

**Goal:** Replace the markdown API page with an interactive Scalar reference at `/api`, rendered from an OpenAPI 3.1 spec that is the single source of the API's docs and is held to the code by contract tests.

**Architecture:** The spec lives in `src/lib/server/openapi.json` and is served at `/api/v1/openapi.json` (so it gets the API's CORS, cache and rate limit). Contract tests in vitest validate every handler's real response against the spec with `ajv`, check routes against `paths`, and check the spec against the OpenAPI 3.1 meta-schema. The `/api` page loads `@scalar/api-reference` with a dynamic import in the browser only, inside the normal site layout, themed from Porobound tokens and following the site's `data-theme`. `docs/api.md` is deleted.

**Issues:** umbrella #134; A = #132, B = #133. B also needs the theme toggle #131.

**Tech Stack:** OpenAPI 3.1 (JSON Schema 2020-12), `ajv` (dev, exact pin), `@scalar/api-reference@1.75.0` (exact pin), SvelteKit, Vitest, Playwright.

**Decisions (grill, 2026-11-01):**

- Single source: the spec replaces `docs/api.md`. Field notes go in schema `description`s (markdown); the intro, conventions, rate limit and the legend-meta example go in `info.description`.
- Scalar comes from npm, pinned to `1.75.0` (newest release ≥ 2 weeks old at planning time), loaded with `import()` in `onMount` so it only ships to `/api` and never runs on the server. Everything is served from our origin; no CDN.
- Inside the site layout (header, footer). Scalar `theme: 'none'` + `customCss` mapping `--scalar-*` to Porobound tokens (`--surface`, `--surface-raised`, `--line`, `--ink`, `--ink-muted`, `--brand`, `--accent`, `--font-sans`, `--font-mono`). Fallback if the layout fights back (sticky sidebar under our header, 390 px mobile check): Scalar full-page with a back link, decided in the ticket.
- Theme: Scalar's `darkMode` follows `data-theme` on `<html>` (watched with a `MutationObserver`); Scalar's own toggle hidden. Depends on the site-wide light/dark toggle issue landing first.
- Features: try-it button on, no `proxyUrl` (same origin); agent off; `withDefaultFonts: false`; `telemetry: false`; code samples limited to curl, JS `fetch`, Python `requests`; search and models on; client button hidden.
- No-JS fallback: `<noscript>` note linking `/api/v1/openapi.json`.
- Contract (all four): ajv 2020 validation of real responses (200 and error), `additionalProperties: false` on every object schema, routes under `src/routes/api/v1/` == spec `paths`, spec valid against the vendored OpenAPI 3.1 meta-schema.

## Files

- Create `src/lib/server/openapi.json`: the spec. `servers: [{ url: '/api/v1' }]`; `components.schemas`: `PlayerRef`, `Error`, `SeasonSummary`, `SeasonDetail`, `Standing`, `Match`, `Result`, `TopCut`, `Slot`, `LegendRow`.
- Create `src/routes/api/v1/openapi.json/+server.ts`: `json(spec)`.
- Create `src/lib/server/openapi.spec.ts`: contract tests.
- Create `src/lib/server/test/openapi-3.1.schema.json`: vendored meta-schema (from spec.openapis.org, dialect version noted in a comment line of the test).
- Modify `src/routes/api/+page.svelte`, delete `src/routes/api/+page.server.ts`.
- Delete `docs/api.md`; drop `!docs/api.md` from `.dockerignore`.
- Modify `docs/spec.md` (Public API section), `docs/ops.md` (rate-limit section points at the spec), `e2e/api.spec.ts`, `e2e/mobile.spec.ts`.
- `package.json`: `ajv` (devDependencies), `@scalar/api-reference` (devDependencies: client-only, bundled by Vite at build).

## Issue A (#132): OpenAPI spec and contract tests

### Task A1: Spec

- [ ] Write `openapi.json` covering the five endpoints plus `/openapi.json`, every response (200, 404 `Error`), every field with its note from `docs/api.md`. Nullable fields as `type: ['string', 'null']`. `additionalProperties: false` on every object.
- [ ] `GET /api/v1/openapi.json` route.

### Task A2: Contract tests (`openapi.spec.ts`)

- [ ] Spec validates against the vendored OpenAPI 3.1 meta-schema.
- [ ] Every `+server.ts` under `src/routes/api/v1/` (via `import.meta.glob`) maps to a spec path (`[slug]` → `{slug}`, `[...rest]` excluded) and every spec path has a route.
- [ ] Seed the scenario from `api.spec.ts` (group stage with reported, flagged and resolved matches, a dropped and an erased player, a published top cut with a bye, legends); call each handler; validate the body against the path's response schema with `ajv/dist/2020`, for 200 and 404.
- [ ] Break once: add a field to a DTO without documenting it, see the test fail.

### Task A3: e2e

- [ ] `/api/v1/openapi.json` over HTTP: 200, CORS and cache headers, `openapi: '3.1.0'`.

## Issue B (#133): Scalar page at `/api`

Needs #132 and the site-wide theme toggle #131.

### Task B1: Page

- [ ] `npm i -D -E @scalar/api-reference@1.75.0`.
- [ ] `+page.svelte`: container element; `onMount` → `import('@scalar/api-reference')` + its `style.css`, `createApiReference(el, config)` with `url: '/api/v1/openapi.json'` and the feature settings above; destroy on unmount.
- [ ] `customCss` maps Scalar variables to Porobound tokens; `darkMode` follows `data-theme`, updated by a `MutationObserver`.
- [ ] `<noscript>` fallback linking the spec.
- [ ] Sticky sidebar offset under the site header; no sideways scroll at 390 px.

### Task B2: Retire the markdown

- [ ] Delete `docs/api.md`, `src/routes/api/+page.server.ts`, the `.dockerignore` line. Privacy and footer links to `/api` stay.
- [ ] `docs/spec.md`: Public API section describes the spec + Scalar; `docs/ops.md` rate-limit section references the spec's intro instead of `docs/api.md`.

### Task B3: e2e

- [ ] `/api` renders the reference: the heading from `info.title` and each endpoint's summary visible (by role/text).
- [ ] Try-it: open `GET /seasons`, send, see a 200 response with the seeded season.
- [ ] Both themes: switching `data-theme` switches Scalar's dark mode.
- [ ] `e2e/mobile.spec.ts`: `/api` fits a phone in both themes.
- [ ] Image build includes the client chunk (CI `image` job).
