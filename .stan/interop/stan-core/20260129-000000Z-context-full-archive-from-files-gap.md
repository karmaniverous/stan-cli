# Context mode FULL archive needs an allowlist API (createArchiveFromFiles)

## Problem (observed in stan-cli)

- In context mode Option B, `stan run -Sc` is producing `.stan/output/archive.tar` that includes the normal repo selection universe (e.g., it includes `src/**` such as `src/test/index.ts`, `src/test/setup.ts`, etc.).
- At the same time, `.stan/context/dependency.state.json` contains only three repo files as seeds (`src/index.ts`, `src/runner/run/index.ts`, `src/runner/run/types.ts`) and no traversal depth tuples (depth defaults to 0).
- The meta archive behavior is correct: meta includes only repo-root (package root) non-excluded files (not `src/**`) plus `.stan/system/**` and the dependency artifacts.
- This means the FULL archive under `--context` (and therefore the DIFF archive keyed to its universe) is using the wrong selection universe.

## Expected semantics (what stan-cli needs)

- Context FULL archive should be: “what META would contain” + “the effect of applying dependency.state.json (closure)”.
- With depth defaulting to 0, the closure should include only the seeded repo files (no traversal), and no extra in-repo files like `src/test/**` unless explicitly selected.
- DIFF must be computed against the context snapshot baseline for that same universe (e.g., `.archive.snapshot.context.json`), not the non-context snapshot baseline.

## Gap in stan-core exports (what blocks stan-cli)

- stan-core currently exports:
  - `createArchiveDiffFromFiles`
  - `writeArchiveSnapshotFromFiles`
- stan-core does not export a FULL “archive from explicit allowlist file list” function (e.g., `createArchiveFromFiles`).
- The existing `createArchiveWithDependencyContext` (and `createArchive`) paths are selection/glob based (includes/excludes universe), so they cannot implement “allowlist-only repo sources” for context FULL without fragile “exclude everything except …” hacks (and excludes win, so this is not practical).

## Proposed stan-core addition

Add a new exported API analogous to `createArchiveDiffFromFiles`, but for FULL:

- `createArchiveFromFiles({ cwd, stanPath, files, baseName?: string, ...opts }) -> { archivePath }` (shape flexible)
- Requirements/behavior:
  - Takes an explicit allowlist of repo-relative POSIX paths (files only, no globs), validates paths (no slashes in snapshotFileName style rules are fine if you reuse that logic).
  - Enforces reserved denials (`.git/**`, `<stanPath>/diff/**`, `<stanPath>/patch/**`, archive outputs under `<stanPath>/output/**`).
  - Preserves `archive.prev.tar` rotation behavior (like `createArchive`).
  - Supports `includeOutputDir` behavior if applicable, or clearly rejects it (caller can add output files explicitly to `files` if needed).
  - Supports the same reporting hooks as existing archive creation (`onSelectionReport`, `onArchiveWarnings`) so adapters can present deterministic stats.

## Why this belongs in stan-core

- It’s an engine responsibility to build a tar from an explicit list safely and deterministically (reserved denials, normalization, ordering, binary screening).
- It enables stan-cli to correctly implement context Option B FULL as allowlist-driven (meta base + closure), while continuing to use the existing `createArchiveDiffFromFiles` for DIFF within the same universe.

## Repro signals (from stan-cli)

- `node -e "import('@karmaniverous/stan-core').then(m=>console.log(Object.keys(m).filter(k=>k.toLowerCase().includes('archive')&&k.toLowerCase().includes('files')).sort()))"` currently prints only:
  - `createArchiveDiffFromFiles`, `writeArchiveSnapshotFromFiles`
- `tar -tf .stan/output/archive.tar | grep '^src/' | head` shows many `src/**` files under `stan run -Sc`, even when state selects only 3 seeds.
