---
title: Getting Started
---

# Getting Started

This guide walks you through setting up STAN in an existing repository and using it effectively in chat.

## 1) Install

Install the STAN CLI globally (pick one):

```bash
npm i -g @karmaniverous/stan-cli
# or
pnpm add -g @karmaniverous/stan-cli
# or
yarn global add @karmaniverous/stan-cli
```

## 2) Initialize in your repo

From your repository root:

```bash
stan init
```

What this does:

- Creates `stan.config.yml` with sensible defaults.
- Ensures `.gitignore` entries for `.stan/output/`, `.stan/diff/`, `.stan/dist/`, and `.stan/patch/`.
- Ensures documentation metadata under `.stan/system/` and creates required directories. The project prompt (`.stan/system/stan.project.md`) is created on demand by STAN when repo‑specific requirements emerge (no template is installed).
- Writes an initial diff snapshot to `.stan/diff/.archive.snapshot.json`.

Migration and safety notes:
- On upgrade from legacy (root‑key) configs, `stan init` migrates to the namespaced layout, writes a `.bak` next to your config, and supports a plan‑only mode via `--dry-run`.

You can re-run `stan init` safely. Use `--force` to accept defaults; otherwise you’ll be prompted.

## 3) Understand stan.config.yml

Minimal example:

```yaml
stanPath: .stan
includes: []
excludes: []
scripts:
  build: npm run stan:build
  lint: npm run lint
  test: npm run test
  typecheck: npm run typecheck
```

Key settings:

- `stanPath` (default `.stan`): STAN workspace folder.
- `scripts`: commands whose combined stdout/stderr become deterministic text outputs (e.g., `test.txt`).
- `includes`/`excludes`: glob controls for archiving; text files are included, binaries automatically excluded.
- Optional:
  - `maxUndos` (history depth for snapshot undo/redo; default 10).
  - `patchOpenCommand` (editor open command; default `"code -g {file}"`).

## 4) Run the loop locally

Build and snapshot:

```bash
stan run
```

This:

- Runs configured scripts (parallel by default).
- Writes deterministic outputs under `.stan/output/*.txt`.
- Creates `.stan/output/archive.tar` and `.stan/output/archive.diff.tar`.
- Prints concise “archive warnings” (binaries excluded, large text call‑outs).

To update the baseline snapshot without writing archives:

```bash
stan snap
```

Patch iterations:

```bash
stan patch              # read unified diff from clipboard
stan patch --check      # validate only (writes to sandbox)
stan patch -f fix.patch # read from a file
```

On failure, STAN writes a compact FEEDBACK packet and (when possible) copies it to your clipboard—paste that into chat to get a corrected diff.

Tips:

- Child PATH augmentation: `stan run` automatically prefixes the child process PATH with `<repoRoot>/node_modules/.bin` (and ancestor `.bin` folders) so repo‑local binaries resolve without global installs.
- Use `stan run -p` to print the plan and exit; use `stan run -P` to execute without printing the plan first.
- Use `-q` for sequential execution (preserves `-s` order).
- Use `-c` to include outputs inside archives and remove them from disk (combine mode).

## 5) Use the bootloader prompt (for chat clients)

STAN ships a small “bootloader” system prompt that reliably loads your attached system prompt from archives:

- Bootloader prompt (source): [.stan/system/stan.bootloader.md](https://github.com/karmaniverous/stan-cli/blob/main/.stan/system/stan.bootloader.md)

How to use with a third‑party client (TypingMind example):

1. Create a custom agent and paste the entire bootloader into the agent’s System Prompt.
2. Model: GPT‑5 (or your preferred GPT‑like model); set “High” reasoning effort and max_output_tokens to 32,000 if available.
3. Start a fresh chat with this agent each time you attach a new archive set.
4. Attach the latest `.stan/output/archive.tar` (and `archive.diff.tar` if present). The bootloader will locate and load `.stan/system/stan.system.md` from the archive automatically.
5. Begin the discussion (e.g., “Here are my archives; please review the plan in `.stan/system/stan.todo.md` and propose next steps.”).

Notes:

- The bootloader performs an integrity‑first tar read and refuses to proceed if `.stan/system/stan.system.md` cannot be found. Attachments are the source of truth.
- If you paste a previous handoff block, STAN uses it as input (does not generate a new handoff unless you explicitly ask).

## 6) Quick checklist

- [ ] `stan init` successfully created config and docs.
- [ ] `stan run` produced text outputs and `archive.tar`/`archive.diff.tar`.
- [ ] You can attach archives in chat and the bootloader loads `stan.system.md`.
- [ ] Patches round‑trip cleanly (`stan patch --check` before applying).

## Troubleshooting

- “Missing system prompt”: Attach an archive containing `.stan/system/stan.system.md` (or attach that file directly as `stan.system.md`).
- Patch failures: Use `--check` to validate; reply in chat with the FEEDBACK packet to receive a corrected diff.
- Large text files flagged: Consider adding globs to `excludes` to trim runtime noise from archives.
