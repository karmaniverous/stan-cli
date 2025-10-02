---
title: Contributing — Dev Quickstart
---

# Contributing — Dev Quickstart

Thanks for helping improve STAN! This project follows a services‑first, test‑first philosophy. Here’s how to get started locally.

## Setup
Prereqs:
- Node ≥ 20
- Git

Clone and install:
```bash
git clone https://github.com/karmaniverous/stan-cli.git
cd stan
npm i
```

## Common tasks

Run the full test and validation suite:
```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run docs
npm run knip
```

### Dev fallback (bootstrap scripts)
If `stan run` is temporarily broken while developing STAN itself, use the
bootstrap scripts as a stopgap to exercise the pipeline and generate the usual
artifacts (outputs and archive) without relying on the CLI:

- Primary orchestrator (runs multiple tasks concurrently and then archives):
  ```bash
  npm run bootstrap
  ```
  This will:
  - run typecheck, lint, test, build, and docs concurrently,
  - write deterministic outputs to `.stan/output/*.txt`,
  - and create `.stan/output/archive.tar`.

- You can also run individual bootstrap tasks:
  ```bash
  npm run bootstrap:typecheck
  npm run bootstrap:lint
  npm run bootstrap:test
  npm run bootstrap:build
  npm run bootstrap:docs
  npm run bootstrap:archive
  ```

Note: these bootstrap scripts are for STAN development only (fallback tooling).
Consumers of STAN should use the CLI directly, e.g. `stan run`.

## Coding standards

- Single‑Responsibility modules; prefer small, testable units.
- Plain unified diffs for patches.
- Keep `.stan/system/stan.todo.md` updated with each change set and include a commit message (fenced) in chat replies.

## Submitting changes

1. Create a feature branch: `git checkout -b feature/your-change`
2. Ensure all CI tasks (`lint`, `typecheck`, `test`, `build`, `docs`) pass locally.
3. Open a Pull Request with a clear description and links to any related issues.
4. Expect a review focusing on tests, documentation updates, and module design. Adherence to the project's design principles is key.

## Questions?
Open a GitHub issue with details or propose a design sketch in the PR description.
