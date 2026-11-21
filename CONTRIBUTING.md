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

- The shared look (buttons, cards, tables, colours, every class that starts with `pb-`) comes from
  the Porobound design system. `src/lib/styles/porobound.css` is a copy of it and is replaced
  whole when the design system changes.
- Don't edit that file, and don't restyle `pb-` classes from `src/app.css`. If you think a button
  or a card should look different everywhere, open an issue with a screenshot or a sketch. The
  change is made in the design system.
- `src/app.css` is for what only this site has: page layout and its own components.

## Images, fonts and other assets

Only add what you made yourself or have a licence for. Say in the pull request where each file
comes from.

## Working with an AI agent

That is fine. The agent's rules for this repo are in [`CLAUDE.md`](CLAUDE.md); this page wins where
they differ for outside contributors. You answer for what you open: read the diff before you send it.
