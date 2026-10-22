# Design review: Claude Design boards vs implementation

Reviewed 2026-10-22 against `main` at `e4ea6a7` (Plan 6 merged). Source: canvas "Poroleague Screens", 37 boards, design system version `1792674616-0cac`. That version matches the `src/lib/styles/porobound.css` snapshot, so there is no CSS drift.

**Priority:** **P1** misleads users or breaks navigation · **P2** a visible gap against the design · **P3** polish or nit.
**Kind:** **gap** = design has it, code doesn't · **diverge** = code does it differently on purpose or by accident · **stale** = the code is right and the board should be updated.

Mobile (11 boards) is already tracked in #18. Only mobile items #18 doesn't list are noted here, in their own section.

## Summary

| #   | P   | Kind    | Screen       | Finding                                                                                  | Status (branch `design-review`)                                                       |
| --- | --- | ------- | ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | P1  | diverge | Header       | Season / Schedule / Legends links vanish on pages without a slug (archive, admin, login) | Fixed: falls back to the latest public season                                         |
| 2   | P1  | diverge | Season       | Before any result, standings show ranks 1–N and the cut line (rows are already A–Z)      | Fixed: rank `–`, no cut line, "No results yet" note (EmptyStandings board)            |
| 3   | P1  | gap     | Schedule     | Round sections have no disclosure chevron (`summary { display: flex }` drops the marker) | Fixed: rotating `pb-disclosure-chev`                                                  |
| 4   | P2  | gap     | Signup       | Signup state is a small panel; design has a hero, three rule tiles, avatar strip         | Fixed                                                                                 |
| 5   | P2  | gap     | Season       | Bye / "all done this week" states are one muted line; design has explanatory boxes       | Fixed                                                                                 |
| 6   | P2  | gap     | Player       | No "Other seasons" table and no Career page                                              | Fixed: table on the player page, `/players/[id]` career page                          |
| 7   | P2  | diverge | Admin IA     | Overview and Season edit are merged into one long page; no phase bar, no recent audit    | Fixed: Overview (pairings, phase bar, flags, recent audit) + Season (settings, end)   |
| 8   | P2  | gap     | Admin season | Name/deadline changes have no confirm and no audit row; design promises both             | Fixed: confirm dialog; `season` audit row for public seasons                          |
| 9   | P2  | stale   | Admin season | Top cut stays editable in play; design locks it                                          | Kept: Plan 3 decided it stays editable (it only moves the line). Board is stale       |
| 10  | P2  | diverge | Notices      | Pages use a custom `.status` box instead of the design system's `pb-notice`              | Fixed: `pb-notice` for messages, dashed `.empty` for empty states (no dismiss button) |
| 11  | P3  | —       | Various      | Copy, layout and small affordance differences (per-screen tables below)                  | Open                                                                                  |
| 12  | —   | stale   | Boards       | Boards that are out of date with decisions made in code (last section)                   | Open                                                                                  |

Issue #9: all three open boxes look done in code (organizer edit covers legends, dice and name labels in `ResultFields.svelte`; no "Leave as double loss" button exists; `name` is editable in `play`). It can probably be closed.

## Global

| P   | Kind    | Design                                                                                            | Implementation                                                                                                                    | Suggestion                                                                      |
| --- | ------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| P1  | diverge | Nav always shows Season · Schedule · Legends · Archive                                            | `+layout.svelte` shows season links only when `page.params.slug` is set: on `/seasons`, `/admin`, `/login/*` you get Archive only | Fall back to the latest public season's slug in `+layout.server.ts`             |
| P3  | diverge | No Admin link or Log out in the public header; admin has its own header with an "Organizer" badge | Admin link + Log out button in the header                                                                                         | Keep (needed). Board is stale                                                   |
| P2  | diverge | Success feedback is a dismissible `Porobound.Notice` toast                                        | `.status` paragraph in `app.css` (accent border, no dismiss). Reimplements `pb-notice`                                            | Use `pb-notice` / `pb-notice-error` markup; drop `.status`                      |
| P3  | diverge | Empty states are dashed boxes (`1px dashed var(--line)`)                                          | Most empty states use `.status` (solid accent border, bold), so "nothing here" looks like a success                               | Add one dashed `.empty` helper (legends page already has it locally) and use it |
| P3  | diverge | Login and problem pages: brand-only header                                                        | Full site header                                                                                                                  | Fine either way                                                                 |

## Season page (`Main`, `EmptyStandings`, `EmptyMyMatches`)

| P   | Kind    | Design                                                                                                                                                                                            | Implementation                                                                        | Suggestion                                                                                                 |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| P1  | fixed   | Before week 1: dashed "Groups are drawn: 2 groups of 12. Standings appear after the first reported match." With no results yet (`EmptyStandings`): alphabetical, rank `–`, note "No results yet…" | Full tables with ranks 1–N (names already A–Z) and no note. Looks like a real ranking | Pick one board (they conflict). Lazy fix: rank `–` and sort by name while nobody has played, plus the note |
| P2  | gap     | Bye: box "You have a bye this week" with an explanation and a schedule link. All reported: "All done for this week"                                                                               | `Bye in round N` muted line; no all-done state                                        | Add the two boxes                                                                                          |
| P3  | gap     | "No matches for you this week." in a dashed box                                                                                                                                                   | Plain muted line                                                                      | Dashed `.empty`                                                                                            |
| P3  | gap     | `Groups & standings` h2 above the group tables                                                                                                                                                    | No section heading                                                                    | Add h2                                                                                                     |
| P3  | diverge | Group header: name left, `12 players · 11 rounds` right on one line                                                                                                                               | Name, then meta on its own line                                                       | Flex row                                                                                                   |
| P3  | diverge | Legend row under the tables: dashed swatch + "Top-cut line…", scoring, tiebreak order, Audit log link                                                                                             | Scoring/tiebreak above tables; cut text + audit link below; no swatch                 | Move into one legend row below with the swatch                                                             |
| P3  | diverge | Dropped player shown with `PlayerName` (avatar + link)                                                                                                                                            | Plain comma-joined names                                                              | Optional                                                                                                   |
| P3  | diverge | Signup/groups states: badge with the season name, h1 season name, meta line                                                                                                                       | Eyebrow with the status label instead of the badge                                    | Optional                                                                                                   |

## Signup (`Signup`, signup state of `Main`)

| P   | Kind    | Design                                                                                                                                  | Implementation                                      | Suggestion                                            |
| --- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| P2  | gap     | Badge "Signup open" (live), h1 "Join the herd for {season}.", lede, three rule tiles (round robin / your schedule / report it yourself) | Season name h1 + small panel                        | Build the hero + tiles (copy needs a pass: see Stale) |
| P2  | gap     | Aside: count, "16 or more makes two groups", avatar strip with "+N more"                                                                | Count + paragraph; full player list below the panel | Avatar strip in the aside; keep or drop the full list |
| P3  | diverge | Signed in: "Groups are drawn after signup closes. You can withdraw until then."                                                         | Same idea in one sentence                           | Fine                                                  |

## Schedule (`Schedule`)

| P   | Kind    | Design                                                                                | Implementation                                                                                            | Suggestion                                                        |
| --- | ------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1  | gap     | Round sections collapse with a rotating chevron                                       | `<details>` with `summary { display: flex }`: browsers hide the marker, so nothing shows it's collapsible | Add `pb-disclosure-chev` (already used on legends) in the summary |
| P3  | gap     | `Week 3 · rounds 5–6` h2 above the sections                                           | None                                                                                                      | Add                                                               |
| P3  | diverge | Two segmented controls: groups (All / A / B) and view (All matches / Only my matches) | One segmented group mixing groups and a "Only my matches" toggle                                          | Split in two                                                      |
| P3  | gap     | In a round: mine first, then flagged → scheduled → reported → void                    | Mine first only                                                                                           | Add status order to the sort                                      |
| P3  | diverge | Week tabs scroll sideways inside their own wrapper                                    | `.seg` nav, no scroll wrapper                                                                             | `overflow-x: auto` wrapper (also helps #18)                       |
| P3  | diverge | Empty view: dashed box                                                                | `.status`                                                                                                 | Dashed `.empty`                                                   |

## Match page (`Report`, `ReportedAgainst`)

| P   | Kind    | Design                                                                                                                | Implementation                                                                       | Suggestion                                      |
| --- | ------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| P3  | diverge | Flagged: reason shown inside the card (`flag-by` / `flag-reason`)                                                     | Card + separate `figure.flag-reason` under it. `MatchCard` already has a `flag` prop | Pass `flag` to the card, drop the figure        |
| P3  | gap     | Legend select hint "Your last-used legend." / "Lumi's last-used legend."                                              | Prefilled, no hint                                                                   | Add hint when prefilled                         |
| P3  | diverge | Reporter flagging own result: dialog title "Made a mistake?", placeholder "e.g. I entered the wrong legend for Lumi." | Title always "Flag this result?", text prefixed "Made a mistake?"; one placeholder   | Switch title/placeholder on `reportedBy === me` |
| P3  | diverge | After save: toast + "Back to the season"                                                                              | Status line + "Back to season"                                                       | Copy only                                       |

## Player page (`Player`, `PlayerCareer`)

| P   | Kind    | Design                                                                                                 | Implementation                               | Suggestion                                                                |
| --- | ------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| P2  | gap     | "Other seasons" table (season, group, rank, points, W–D–L; dropped in red); "First season" text        | Missing                                      | Cheap: one query over entries across seasons. Do it with Career, or alone |
| P2  | gap     | "Career" link next to the name → career page (totals, season by season, legends across seasons)        | Missing. Spec open items list "career stats" | Ticket it; deferred by spec                                               |
| P3  | gap     | Legend tables: W green / L red, muted zeros (`tone()`), `pb-striped`, `abbr` titles on M / W–D–L / GW% | Plain numbers, no `abbr`                     | Reuse the legends page `wdl` snippet                                      |
| P3  | diverge | "No reported matches yet." in a dashed box                                                             | `.status`                                    | Dashed `.empty`                                                           |

## Legends (`Legends`, `LegendsEmpty`)

Closest match of all screens. Only nits:

| P   | Kind | Design                                                     | Implementation | Suggestion |
| --- | ---- | ---------------------------------------------------------- | -------------- | ---------- |
| P3  | gap  | Visually hidden caption "Legends this season, sorted by …" | No caption     | Add (a11y) |

## Archive (`Archive`, `EmptyArchive`)

| P   | Kind    | Design                                                                               | Implementation                                                             | Suggestion                        |
| --- | ------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------- |
| P3  | gap     | Running season card has a `var(--brand)` border                                      | All cards the same                                                         | Border on the non-finished season |
| P3  | diverge | Empty: dashed box "No finished seasons yet", explanation, "Go to the current season" | `.status` "No seasons yet. The first one shows up here once signup opens." | Dashed `.empty` + copy            |

## Home / empty (`EmptyNoSeason`, `EmptyDraft`)

| P   | Kind    | Design                                                                                            | Implementation                                                    | Suggestion            |
| --- | ------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| P3  | gap     | Draft: phase bar, h1 "Next season coming soon.", season name in the lede, "See past seasons" link | No phase bar or archive link; h1 "The next season is on its way." | Add the link at least |
| P3  | diverge | No season: "Organizer? Create the first season" text link                                         | "Go to admin" button                                              | Fine                  |

## Login problems (`LoginNotMember`, `LoginNotOrganizer`, `LoginFailed`)

Copy matches word for word. Only the header differs (see Global).

## Audit log (`PublicAudit`)

| P   | Kind    | Design                                                      | Implementation                      | Suggestion                  |
| --- | ------- | ----------------------------------------------------------- | ----------------------------------- | --------------------------- |
| P3  | gap     | "← Standings" back link above the eyebrow                   | None                                | Add                         |
| P3  | gap     | Column header "When (EET)"                                  | "When"                              | Add `tzName`                |
| P3  | gap     | "Who" uses `PlayerName` (avatar + link); table `pb-striped` | Plain name                          | Optional                    |
| P3  | diverge | Filter as pill chips                                        | `.seg`                              | Fine; same on admin matches |
| P3  | diverge | Lede "…in the order it happened."                           | "…newest first." (code is accurate) | Keep code                   |

## Admin

| P   | Kind    | Board                  | Design                                                                                                                                                                                                                                       | Implementation                                                                                                         | Suggestion                                                                |
| --- | ------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P2  | diverge | Admin, AdminSeasonEdit | Sidebar: Overview · Players · Groups · Matches · Season. Overview = h1 "Season overview", pairings + "Edit deadline" buttons, phase bar, flags, recent audit log (4 rows, link to full). Season = edit form, lock note, end-of-season teaser | One "Season" page holds pairings, flags, end of season, lifecycle buttons, form, delete. No phase bar, no recent audit | Split Overview off the form; add phase bar + last few audit rows          |
| P2  | gap     | AdminSeasonEdit        | Save opens a confirm summarising the rename / new deadline; "Changes are logged in the public audit log"                                                                                                                                     | Saves directly; season edits write no audit row (only drop, undrop, tiebreak, finalize do)                             | A deadline change decides double losses, so audit it; confirm is optional |
| P2  | diverge | AdminSeasonEdit        | In play: only name + deadline editable; top cut "Locked since groups were locked"                                                                                                                                                            | `EDITABLE.play` includes `topCutSize`                                                                                  | Decide; if intended, update the board                                     |
| P3  | gap     | AdminSeasonEdit        | Signal-bordered lock note: "Groups were locked on {date}… name and deadline can still change"; per-field locked hints ("Locked: week 1 has started")                                                                                         | Generic "Locked at this stage of the season."                                                                          | Add the note; per-field hints optional                                    |
| P3  | diverge | AdminSeasonNew         | Sidebar "Seasons: New season · Past seasons"; phase bar; slug hint previews the URL live; deadline field has a "23:59 EET" suffix                                                                                                            | `/admin` lists seasons + create form; slug "leave empty"; deadline hint says "Helsinki time"                           | Fine. `tzName` instead of "Helsinki time" would match the season pages    |
| P3  | gap     | GroupPreview           | Eyebrow "Signup closed · N players", phase bar, footnote "Organizer role is checked again when you lock"; lock dialog shows a group-size summary; after lock "Post round 1 pairings from the overview"                                       | None of these; plain "Groups are locked" status                                                                        | Add the dialog summary + post-lock hint                                   |
| P3  | diverge | GroupPreview           | Group meta right-aligned in the header; "Move to B →" / "← Move to A"                                                                                                                                                                        | Meta below; "Move to B"                                                                                                | Nit                                                                       |
| P3  | gap     | AdminPlayers (signup)  | Table: `#`, player, "Signed up" time, Remove; h1 "Players · N"; "Close signup" button on this page                                                                                                                                           | Plain list without times; close signup only on the Season page                                                         | Add signup time column                                                    |
| P3  | diverge | AdminMatches           | Pill filter chips; scheduled badge reads "This week"; only Enter for unplayed                                                                                                                                                                | `.seg` filter; "Scheduled"; Edit/Enter/Keep on every row (more capable)                                                | Keep code; "Scheduled" is more accurate for future weeks                  |
| P3  | gap     | AdminEndSeason         | Unplayed matches listed inline with "Enter result" each; final standings preview table under the ties                                                                                                                                        | Count + link to matches filter; no preview                                                                             | Optional                                                                  |

## Mobile items not in #18

| P   | Board                               | Note                                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| P2  | MobileSeason                        | One group at a time behind a group segmented control, not stacked tables                          |
| P2  | MobileReport, MobileReportedAgainst | Back-arrow header with page title ("Add result" / "Match"); primary action in a sticky bottom bar |
| P2  | MobileSignup                        | Sticky bottom bar with the sign-up / withdraw action                                              |
| P3  | MobileAdmin                         | Horizontal scrolling admin nav; recent audit as a compact list instead of a table                 |
| P3  | MobileLogin                         | Organizer-only copy ("Admin is for organizers…") differs from the desktop board; pick one         |

## Stale boards (code is right, update the design)

- **Pairings dialog** (Admin, MobileAdmin): "…and pings every player in them". Code posts names and says "Nobody is pinged" (deliberate).
- **Finalize dialog** (AdminEndSeason): "the top 4 in each group are marked as top-cut qualifiers". There is no top-cut feature yet.
- **End of season** (AdminEndSeason): 3 steps. Code has 4 (adds "Flagged results"), and finalize is blocked on open flags.
- **Signup copy**: "deadlines are 23:59 Finnish time". Code derives the zone with `tzName`.
- **EmptyNoSeason**: "an online Riftbound league from Finland". Invented copy; code dropped it.
- **Public header**: no Admin / Log out (see Global).
- **Main vs EmptyStandings**: the two boards disagree on what the season page shows before any result (finding 2). Code follows EmptyStandings.
- **AdminSeasonEdit**: locks top cut in play; Plan 3 keeps it editable (finding 9).
