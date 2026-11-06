# Page screenshots in the repo

Issue: #210

## Why

The owner reviews PRs, often from a phone, and wants to see what the touched views look like after a change, and how they looked before, without opening the dev server. Pages that change by accident should also be noticed.

## The idea

Screenshots are ordinary files in the repo. A PR that changes a page commits the regenerated images, so the PR's file diff is the before and after. The agent writing the PR looks at the changed images before pushing and says what changed and why.

## Goals

- `npm run shots` regenerates every image from scratch, with one command.
- A fixed set of main pages is always covered, at desktop and phone width. A change that reaches another page by accident then appears as a changed image.
- A PR can add a shot of the exact state it changes, by seeding that state. Example: the "Up next: week 2" section from #209 only exists when a week is published early.
- Running it twice with no code change produces byte-identical images.
- A `CLAUDE.md` rule makes this part of every frontend PR.

## Non-goals

- No CI comparison, and no CI job for screenshots. Nothing goes red when an image changes or when someone forgets to regenerate. The owner accepted losing that guarantee in exchange for simplicity.
- No PR comments or bots.
- No Loki or Storybook. The repo has no Storybook.
- No difference thresholds: images are compared by the git diff only.
- No shots of prod or real data.
- No light theme shots. The owner accepted that a CSS change could break light mode without any image changing.

## Anti-goals

It has failed, even if it works, if:

- images change on PRs that didn't change the page (noise trains everyone to ignore the diff);
- production code gains test-only branches or a fake clock;
- existing e2e tests slow down or change behaviour.

## Constraints

- **One renderer.** Only the remote agent container generates images. Its fonts and browser differ from CI runners and the owner's PC, and a run elsewhere would change every image. It has Playwright's Chromium and no Docker. The rule says so.
- **Fictional date.** Every run believes it is one fixed moment: 2040-01-02 12:00 UTC, a Monday. Pages render on the server with `new Date()` (28 uses in `src/`, none in `.svelte` files), so the clock must be frozen in three places: the app server process, the process that seeds data, and the browser (`page.clock`). Do this with a test-only script loaded through `NODE_OPTIONS=--import`, not in app code.
- **SQL timestamps.** `schema.ts` defaults timestamps to `unixepoch()` in SQLite, which a Node clock doesn't reach. Seeds for shots must leave no real time on anything a page displays, for example by setting those columns explicitly.
- **Fonts.** `src/app.html` loads Archivo, Bricolage Grotesque and JetBrains Mono from Google at runtime. For shots, Playwright intercepts those requests and serves copies stored with the shots tooling, and each shot waits for `document.fonts.ready`. Production keeps loading from Google. A missing font must fail the run, not fall back silently.
- **Separate from e2e.** `testDir: 'e2e'` in `playwright.config.ts` must not pick up shots. Shots use their own config, port and database, so they can run beside `npm run dev` and don't touch `npm run test:e2e`.
- **Repo rules.** Pinned dependencies, no new dependency expected. Only the Playwright already installed. PR size budget per the owner's rules: images don't count toward it.
- **Don't mark images `linguist-generated`:** GitHub would collapse the diff that this whole feature exists to show.

## What gets shot

Start from the page lists in `e2e/mobile.spec.ts` (visitor, player, organizer), which already cover nearly every route, with a seeded season a week in. Add `/seasons/<slug>/top-cut` and any route the list misses, where seeding it is cheap. Skip `/api`: it renders on the client through a third-party component and isn't worth the risk of noise. Each view is shot in the dark theme only, the default, at 1200 × 900 and 390 × 844, full page, at `deviceScaleFactor: 1` to keep the repo small.

Rough size: 50–60 images at about 100 KB each, so about 5–6 MB to start, plus about 100 KB per image a PR changes. If the first run comes in far above that, say so in the PR.

Image names are stable and readable, including viewport and role, for example `desktop/player-season.png`. A full run deletes the image folder first, so a removed shot disappears from the repo.

## The rule (repo `CLAUDE.md`)

Add a short rule under Rules with this meaning:

- Any PR that can change what a page looks like runs `npm run shots` and commits the result. Add a shot for any state the PR introduces that the fixed set doesn't show.
- Look at every changed image before pushing. The PR body lists which changed and why. An unexplained change is a bug to fix, not an image to commit.
- Check for drift first: before starting, regenerate on a clean `origin/main`. If images change, pages changed without new images (a PR from the owner's PC, or one that skipped the rule), so open a small `chore: refresh screenshots` PR and keep the feature PR's diff to its own changes.
- Regenerate rather than merge images: on a rebase conflict, take either side and rerun.
- Only the remote agent container generates images. A Playwright or browser upgrade regenerates everything in its own PR.

## Build order

1. **Test determinism first.** Throwaway spike: frozen clock, local fonts, a few pages including the longest full-page shots, two runs, compare bytes. If ordinary pages can't be made identical, stop and bring it back to the owner, because the design rests on this. A single page that won't settle goes on a short skip list in the shots tooling, with the reason, and is named in the PR.
2. Build the tooling and the fixed set, in one PR with the rule. The first PR has no "before" images, by nature.

## Left to the builder

File layout and names, how the clock script is written, how shots reuse `e2e/db.ts` and `e2e/fixtures.ts` given their hard-coded port and database path, how to shape the seed season, and the helper API for adding a state-specific shot.

## Open check for the owner

How usable GitHub's image diff is on a phone hasn't been checked. If it's poor, a follow-up could link images in the PR body. Not part of this work.
