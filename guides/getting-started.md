---
title: Getting Started
---

# Getting Started

This guide walks you through setting up STAN in an existing repository and using it effectively in chat.

Related guides:

- [Stan Configuration](./configuration.md)
- [CLI Usage & Examples](./cli-examples.md)

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
- Ensures `.gitignore` entries for `.stan/{output,diff,dist,patch,imports}` in .gitignore
- Ensures documentation metadata under `.stan/system/` and creates required directories. The project prompt (`.stan/system/stan.project.md`) is created on demand by STAN when repo‑specific requirements emerge (no template is installed).
- Writes an initial diff snapshot to `.stan/diff/.archive.snapshot.json`.

Migration and safety notes:

- On upgrade from legacy (root‑key) configs, `stan init` migrates to the namespaced layout, writes a `.bak` next to your config, and supports a plan‑only mode via `--dry-run`.
- See [Migration — Namespaced Configuration](./migration.md) for details.

You can re-run `stan init` safely. Use `--force` to accept defaults; otherwise you’ll be prompted.

## 3) Understand stan.config.yml

Minimal example:

```yaml
stan-core:
  stanPath: .stan
  includes: []
  excludes: []
stan-cli:
  scripts:
    build: npm run build
    lint: npm run lint
    test: npm run test
    typecheck: npm run typecheck
```

Key settings:

- `stan-core.stanPath` (default `.stan`): STAN workspace folder.
- `stan-cli.scripts`: commands whose combined stdout/stderr become deterministic text outputs (e.g., `test.txt`).
- `stan-core.includes` / `stan-core.excludes`: glob controls for archiving (binaries are excluded automatically by the engine).
- Optional (under `stan-cli`):
  - `maxUndos` (history depth for snapshot undo/redo; default 10).
  - `patchOpenCommand` (editor open command; default `code -g {file}`).
  - `cliDefaults` (config-driven CLI defaults; see [CLI Usage & Examples](./cli-examples.md)).

See [Stan Configuration](./configuration.md) for the complete schema and examples.

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

## 5) Set up the assistant (TypingMind — recommended)

STAN depends on the presence of its bootloader system prompt to load `.stan/system/stan.system.md` from your attached archives. While it can be used in the GPT web app, the most reliable setup is a dedicated client with the bootloader preinstalled.

See: [Bootloader & Assistant Setup](./bootloader.md)

TypingMind one‑click setup (recommended; requires an OpenAI API key with GPT‑5 access):

1. Import the STAN GPT agent (bootloader included) using [this link](https://cloud.typingmind.com/characters/c-01KDYW9NG2KGMFN7FTC4MHRSKB)
2. In TypingMind, start a fresh chat with this agent whenever you attach a new archive set. Use GPT‑5.2 with “High” reasoning if available (this is built into the agent linked above)
3. Attach the latest `.stan/output/archive.tar` (and `archive.diff.tar` if present). The bootloader will locate and load `.stan/system/stan.system.md` from the archive automatically.
4. Begin the discussion (e.g., “Here are my archives; please review the plan in `.stan/system/stan.todo.md` and propose next steps.”).

Other clients

- If you prefer another client, ensure its system prompt contains the bootloader (see the guide above).
- It is possible to run STAN in the GPT web application, but it’s not recommended because the bootloader must be present for reliable operation. If you wish to try, add the bootloader to the project instructions of a GPT project.

### Guardrails & limits

- Keep attached archives small (ideally under ~600k) to get many turns per thread. When you run out of context, say `handoff`; paste the handoff at the top of a new thread along with your latest full archive.
- In subsequent turns within the same thread, attach only the diff archive (`archive.diff.tar`), not the full archive.
- When editing Markdown that contains embedded code blocks, assistants can sometimes mangle code fence nesting. If that happens, back up and remind the assistant to follow its fence‑hygiene rules (outer fence must be one backtick longer than any inner fence).
- Sometimes an assistant will produce an invalid diff patch (e.g., wrapped in `*** Begin/End Patch ***`), especially with very large archives (>800k). Back up and remind the assistant to provide a plain, valid unified diff (git‑style headers, no wrappers).
- A total uploaded artifact load much over ~900k can exhaust a thread’s budget. Use facets to present a partial view, and consider splitting your project into multiple repos before you reach this limit.

## 6) Quick checklist

- [ ] `stan init` successfully created config and docs.
- [ ] `stan run` produced text outputs and `archive.tar`/`archive.diff.tar`.
- [ ] You can attach archives in chat and the bootloader loads `stan.system.md`.
- [ ] Patches round‑trip cleanly (`stan patch --check` before applying).

## Troubleshooting

- “Missing system prompt”: Attach an archive containing `.stan/system/stan.system.md` (or attach that file directly as `stan.system.md`).
- Patch failures: Use `--check` to validate; reply in chat with the FEEDBACK packet to receive a corrected diff.
- Large text files flagged: Consider adding globs to `excludes` to trim runtime noise from archives.

Next: [The STAN Loop](./the-stan-loop.md) and [Archives & Snapshots](./archives-and-snapshots.md).
