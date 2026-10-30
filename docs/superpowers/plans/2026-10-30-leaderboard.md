# Cross-season Leaderboard Implementation Plan

**Goal:** Organizers see one table at `/admin/players` ranking every player across all non-deleted seasons by Elo (issue #109, with the design-review comment).

**Architecture:** Pure `ratings()` in `src/lib/league/rating.ts` replays counted matches in order. `leaderboard()` in `src/lib/server/players.ts` picks the matches (reported, not a walkover, live season; dropped players' matches count), the roster (entries in live seasons past groups) and each player's best finish (top cut beats group place), and sorts. Nothing stored, no migration.

**Decisions:**
- Elo K=32, start 1500, any equal score is a draw, floats kept; order `reportedAt`, then `matches.id`.
- Roster: players entered in a live season in play, top cut or finished. Signup-only players aren't listed yet.
- Best finish: Champion > Runner-up > Semifinal > Quarterfinal > Round of N > best group place (`#2 of 16`); dropped seasons and seasons with no played match give no place.
- Names link to the career page `/players/[id]` (it exists now; issue predates it).
- Sort: rating desc, players with no counted match last ("—"), then name. No client-side re-sorting.

### Task 1: Rating (`rating.ts`)
- [ ] `ratings(matches)` + unit tests: win/draw/loss deltas, `0-0` draw, order matters, zero-sum.

### Task 2: Leaderboard query (`players.ts`)
- [ ] `leaderboard()` + server tests: walkovers, unreported and deleted-season matches excluded; dropped players' matches counted; W-D-L, game-win %, seasons, best finish, sort.

### Task 3: Page `/admin/players`
- [ ] `organizerPage` load, table, link from `/admin`.
- [ ] e2e: organizer sees the table, a player is refused; add to `e2e/mobile.spec.ts` organizer pages.
