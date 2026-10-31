# Theme Toggle Implementation Plan

**Goal:** Players pick light or dark for the whole site; the choice sticks in that browser with no flash of the wrong theme (#131).

**Architecture:** A `theme` cookie (`light` | `dark`) is read once in `hooks.server.ts` into `locals.theme`, written into `<html data-theme>` via `transformPageChunk`, and passed to the layout for the toggle's icon/label. The toggle sets the cookie from the browser and flips `document.documentElement.dataset.theme`; no reload, no server round trip. Tokens already ship both themes; the design-system snapshot is re-synced for `color-scheme` per theme and the light overlay.

**Tech Stack:** SvelteKit hooks, Svelte 5, Playwright. No new dependencies.

**Decisions (from the Claude Design light-theme boards and the DS README, 2026-11-01):**

- Default dark. Nothing switches on its own: no `prefers-color-scheme` (a "Match device" option can come later).
- Cookie, not `localStorage`: the server renders the right theme, so no inline script and no flash. Not `httpOnly` (the browser writes it), one year, `SameSite=Lax`.
- Desktop: 40 px icon button in the nav (moon in dark → "Switch to light mode", sun in light → "Switch to dark mode"), before the account links (`LightSeason` board).
- Phone, logged in: a "Light mode" / "Dark mode" item with the icon in the account menu, above Log out (`LightMobileSeason` board). Phone, logged out (no board): the same icon button next to Log in.
- `color-scheme` per theme comes from the DS snapshot; the `:root { color-scheme: dark }` override in `app.css` goes.
- Hard-coded colours: only `ConfirmButton`'s `dialog::backdrop`; light gets the DS light overlay `rgba(22, 26, 32, 0.45)`.
- `e2e/mobile.spec.ts` stays single-theme: themes swap colours only, layout is identical, and the toggle renders in both.

## Task 1: Re-sync the design system snapshot

- [ ] Replace `src/lib/styles/porobound.css` with DS version 1793485399-984c: light `--accent` `#0e7461`, the theme `color-scheme` block and the light `.pb-overlay`.
- [ ] Drop `color-scheme: dark` from `src/app.css`.
- [ ] `ConfirmButton.svelte`: light `dialog::backdrop`.
- [ ] `npm run check`; commit `chore(styles): re-sync Porobound snapshot with light theme fixes`.

## Task 2: Theme cookie rendered by the server

- [ ] `App.Locals.theme: 'light' | 'dark'`; `hooks.server.ts` sets it from the `theme` cookie (anything else → dark) and `transformPageChunk` fills `%theme%`.
- [ ] `src/app.html`: `<html lang="en" data-theme="%theme%">`.
- [ ] Layout load returns `theme`.

## Task 3: Toggle in the header and account menu

- [ ] `+layout.svelte`: `theme` state from data, `toggle()` writes the cookie and `data-theme`; desktop icon button, phone menu item, phone logged-out icon button.
- [ ] Styles in `src/app.css` (`.theme-btn`, menu item icon gap).
- [ ] `e2e/theme.spec.ts`: dark by default; desktop toggle flips `data-theme` and survives a reload; phone account menu toggles; phone logged-out button toggles.
- [ ] `npm run check`, `npx vitest run`, `npm run test:e2e`; commit `feat(theme): light and dark theme toggle`.
