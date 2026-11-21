# Contributing

Thanks for wanting to help. This page is for people outside the team. The short version: **open an
issue before you write code, and keep each pull request small.**

## Before you start

- Open a [GitHub issue](https://github.com/Porobound/poroleague/issues/new/choose) and say what you
  want to change and roughly how. The team plans in a private tracker, so the GitHub issue is how we
  see your idea.
- Wait for a yes on anything visual, or anything over about 100 lines. A redesign nobody asked for is
  the most likely work to be turned down.

## Branch, title, body

The `naming` check enforces these, and a branch cannot be renamed once its pull request is open.

- Branch: `type/<issue number>-slug`, for example `fix/112-pairings-names`.
- Title: `type(scope): summary`, at most 72 characters, no full stop. Types: `feat fix docs test
refactor chore ci`.
- Body: contains `Closes #112` for the branch's issue.

## Size

- At most about 400 lines of hand-written code and tests per pull request. Over that, split it.
- One concern per pull request. A fix you notice on the way gets its own.
- A big change comes as a series: pure logic with unit tests first, then one page per pull request.
  Say in the issue how you plan to split it.

## What to run

```
npm run lint
npm run check
npx vitest run
npm run test:e2e     # when a page changes
```

- Every change comes with tests in the same pull request: unit tests for logic and server code, an
  e2e spec for pages.
- CI runs all of it, so a red check tells you what is left. You don't need a full local setup to
  open a pull request.
- On Windows, the backup script tests are skipped. Everything else should pass.

## Screenshots

A pull request that changes how a page looks needs new images in `.shots/`. `npm run shots` makes
them and needs Docker. If you don't have Docker, say so in the pull request: a maintainer runs it
on your branch.

## How things look

- Shared styles (buttons, cards, tables, colours, every class that starts with `pb-`) are in
  `src/lib/styles/porobound.css`. Page layout and one-off components are in `src/app.css`.
- To change how a shared thing looks, edit its rule where it is defined. Don't add a second rule
  elsewhere that overrides it.
- A visual change is judged on its screenshots, so keep each pull request to one kind of change:
  buttons in one, tables in another.

## Images, fonts and other assets

Only add what you made yourself or have a licence for. Say in the pull request where each file
comes from.

## Working with an AI agent

That is fine. The agent's rules for this repo are in [`CLAUDE.md`](CLAUDE.md); this page wins where
they differ for outside contributors. You answer for what you open: read the diff before you send it.
