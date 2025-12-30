> **_STAN is a CLI that bridges your IDE with your favorite LLM and drives a rapid, powerful, low-friction, design-first iterative development process. Real-world AI-assisted development for professional engineers!_**

# STAN — STAN Tames Autoregressive Nonsense

[![npm version](https://img.shields.io/npm/v/@karmaniverous/stan-cli.svg)](https://www.npmjs.com/package/@karmaniverous/stan-cli) ![Node Current](https://img.shields.io/node/v/@karmaniverous/stan-cli) <!-- TYPEDOC_EXCLUDE --> [![docs](https://img.shields.io/badge/docs-website-blue)](https://docs.karmanivero.us/stan) [![changelog](https://img.shields.io/badge/changelog-latest-blue.svg)](https://github.com/karmaniverous/stan-cli/tree/main/CHANGELOG.md)<!-- /TYPEDOC_EXCLUDE --> [![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/stan-cli/tree/main/LICENSE)

![STAN Loop](https://github.com/karmaniverous/stan-cli/raw/main/assets/stan-loop.png)

STAN produces a single source of truth for AI‑assisted development: a tarball of your repo plus deterministic text outputs from your build/test/lint/typecheck scripts.

You get portable, auditable, reproducible context—locally and in CI.

Because a freaking chatbot shouldn’t gaslight your code.

---

## Quick start

### 1. Install

```
npm i -g @karmaniverous/stan-cli
# or
pnpm add -g @karmaniverous/stan-cli
# or
yarn global add @karmaniverous/stan-cli
```

### 2. Initialize in your repo

```
stan init
```

- Creates stan.config.yml and scaffolds STAN docs under <stanPath> (default .stan).
- Adds sensible .gitignore entries for <stanPath> subfolders (including imports/).

### 3. Run the loop

- **Build & Snapshot**

  Make any changes you like to your code. Then snapshot your code base and outputs from test, build & diagnostic scripts with:

  ```
  stan run
  ```

- **Share & Baseline**

  Commit your changes.

  Attach `.stan/output/archive.tar` and your script outputs to your chat along with your requirements or comments. Or nothing: STAN will just advance your current dev plan. Use the smaller `archive.diff.tar` in subsequent turns to make the most your context window.

  Then baseline your next differential archive with:

  ```
  stan snap
  ```

- **Discuss & Patch**

  Iterate in chat until you have a set of patches that advance your dev plan in the direction you want to go. These will include updates to your requirements and your dev plan, as well as a detailed commit message!

  If you exhaust your context window, say `handoff`, copy the resulting document, and paste it into a new chat thread along with your latest artifacts.

  Apply each patch with:

  ```
  stan patch
  ```

- **Repeat**

  When all your tests are passing and all your requirements are met, you're done!

---

## Why STAN?

- **Reproducible context:** one archive captures exactly the files to read.
- **Structured outputs:** test/lint/typecheck/build logs are deterministic and easy to diff.
- **Always‑on diffs:** STAN writes archive.diff.tar for changed files automatically.
- **Preflight guardrails:** nudges you to update prompts when the baseline changes.
- **Patch workflow:** paste a unified diff or read from a file; STAN applies it safely and opens modified files in your editor. If a patch fails, STAN provides an improved patch and a full listing just for good measure.

---

## Configuration (stan.config.yml)

Minimal example:

```
stanPath: .stan
includes: []
excludes: []
scripts:
  build: npm run build
  lint: npm run lint
  test: npm run test
  typecheck: npm run typecheck
```

See [STAN Configuration](./guides/configuration.md) for more!

---

## Commands at a glance

- **Run** (build & snapshot)
  ```bash
  stan run                 # runs all configured scripts and writes archives
  stan run -s test         # run only “test”
  stan run -S              # do not run scripts (combine with -A/-p)
  stan run -x test         # run all except “test”
  stan run -q -s lint test # sequential run subset in provided order
  stan run -c -s test      # combine archives & outputs
  stan run -A              # do not create archives
  stan run -p              # print plan only, no side effects
  stan run -P              # do not print the plan first
  ```
- **Snap** (share & baseline)
  ```bash
  stan snap  stan snap undo | redo | set <index> | info
  stan snap -s # stash before snap; pop after
  ```
- **Patch** (discuss & patch)
  ```bash
  stan patch               # from clipboard
  stan patch --check       # validate only
  stan patch -f file.patch # from file
  ```

See [CLI Usage & Examples](./guides/cli-examples.md) for more!

---

## Documentation

- [API reference](https://docs.karmanivero.us/stan)
- Guides:
  - [Getting Started](./guides/getting-started.md) — Install the CLI, initialize a repo, and attach archives in chat. Recommended chat setup: import the STAN GPT agent into TypingMind (bootloader included; requires GPT‑5 access) via [this link](https://www.typingmind.com/characters/c-01K5X5RVA4N1DWBQWWJBYDNX2W).
  - [The STAN Loop](./guides/the-stan-loop.md) — How Build & Snapshot → Share & Baseline → Discuss & Patch work together.
  - [CLI Usage & Examples](./guides/cli-examples.md) — Common flags and invocation patterns, including `-p`, `-P`, `-S`, `-A`, and `-c`.
  - [Migration — Namespaced Configuration](./guides/migration.md) — Upgrade legacy configs using `stan init` (backs up `.bak`; supports `--dry-run`).
  - [Stan Configuration](./guides/configuration.md) — All config keys, includes/excludes semantics, and phase‑scoped CLI defaults.
  - [Patch Workflow & Diagnostics](./guides/patch-workflow.md) — Unified diff policy, diagnostics envelopes, and assistant expectations.
  - [Archives & Snapshots](./guides/archives-and-snapshots.md) — What goes into `archive.tar`/`archive.diff.tar`, combine mode, and snapshot history. Additional references:
- [Bootloader & Assistant Setup](./guides/bootloader.md) — How the assistant loads `.stan/system/stan.system.md` from attached archives.
- The following documents are maintained by STAN and live under `<stanPath>/system/` in your repo:
  - `stan.project.md` contains your evolving project requirements.
  - `stan.todo.md` contains your evolving development plan.

- Case studies:
  - [rrstack](./guides/case-studies/rrstack.md) — how STAN enabled rapid development in a couple of days.
- Comparison: [Why STAN Over Alternatives?](./guides/why-stan-over-alternatives.md)
- Tutorial: [Quickstart (End‑to‑End)](./guides/tutorial-quickstart.md)
- [FAQ](./guides/faq.md) — answers to common questions and pitfalls.
- Contributing: [Dev Quickstart](./contributing.md)

---

## Troubleshooting

- “system prompt missing”: ensure <stanPath>/system/stan.system.md is included in the attached archive; otherwise attach it directly as stan.system.md.
- Patch failures: use --check to validate first; if a patch fails, STAN writes a concise diagnostics envelope (attempt summaries + jsdiff reasons) and copies it to your clipboard (stdout fallback) so you can get a corrected patch.
- Large files: STAN may flag very long source files (~300+ LOC) and ask for a split plan before proceeding.

---

## Contributing

- See the [Contributing — Dev Quickstart](./contributing.md) for local setup and workflow tips.

- Keep the loop simple. Each stage ends with one command.
- Favor small, testable modules; treat >300 LOC as design feedback.
- Improve the project prompt (<stanPath>/system/stan.project.md) when repo‑specific policies evolve.

---

## License

BSD‑3‑Clause
