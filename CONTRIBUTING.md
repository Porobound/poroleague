# Contributing

Thanks for wanting to help. This page is for people outside the team. The short version: **open a
pull request, give it an issue, and keep it small.** The maintainer approves it or says what is in
the way.

## The issue

- Every pull request closes an issue, and the `naming` check looks for it. Open a
  [GitHub issue](https://github.com/Porobound/poroleague/issues/new/choose) that says what you
  change. The team plans in a private tracker, so the GitHub issue is where your change is recorded.
- You don't need an answer on the issue before you open the pull request.
- For a large or visual change, a line in the issue about how you plan to split it helps the review.

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
  Say in the issue how you plan to split it. The series is a stack: see below.

## Stacks

A change that needs more than one pull request comes as a stack, using GitHub's
[stacked pull requests](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs), and
the stack is reviewed and merged as one.

- The first pull request targets `main`. Each next one targets the branch of the one before it and
  is linked with **Create stack** on the site, or with `gh stack submit`. Its diff then shows only
  its own change.
- Each pull request is reviewed on its own. Nothing merges until every one in the stack is approved.
  Then the maintainer merges the whole stack at once, and each pull request becomes one commit on
  `main`.
- A fix to a lower pull request is a new commit on that branch. Bring the branches above it back in
  line with **Rebase stack**, or with `gh stack rebase` and `gh stack push`. Don't merge a lower
  branch into a higher one: a stack with merge commits between its branches cannot merge.
- A stack needs every branch in this repository; it does not work from a fork. From a fork, send one
  pull request at a time, or ask for push access first.
- A fix or a clean-up that stands on its own is not part of a stack: open it against `main` and it
  merges alone.

## What to run

```
npm run lint
npm run check
npx vitest run
npm run test:e2e     # when a page changes
```

- Every change comes with tests in the same pull request: unit tests for logic and server code, an
  e2e spec for pages.
- CI runs all of it too, so a red check tells you what is left.
- On Windows, the backup script tests are skipped. Everything else should pass.

## Screenshots

A pull request that changes how a page looks commits new images in `.shots/`. Run `npm run check`,
then `npm run shots`, look at every changed image, and list them in the pull request with why.
`npm run shots` renders in Playwright's Docker image, so every machine makes the same pixels: you
need Docker for it.

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

## After a review

- Answer review points with new commits on top of the ones that were reviewed. Don't amend, squash
  or rebase them: a rewritten branch hides what changed since the review, and the whole pull request
  has to be read again. The pull request is squashed when it merges, so a tidy history gains nothing.
- In a stack, **Rebase stack** is how the branches catch up with a fix below them or with `main`. It
  changes no diff, and GitHub keeps the approvals. Any other rebase, for example to solve a conflict
  by hand, is pushed on its own, with no other change in it, and announced in a comment. Fixes go in
  a separate push, before or after.

## Working with an AI agent

That is fine. The agent's rules for this repo are in [`CLAUDE.md`](CLAUDE.md); this page wins where
they differ for outside contributors. You answer for what you open: read the diff before you send it.
