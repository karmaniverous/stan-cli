# Archives & preflight (binary/large files; baseline/version awareness)

- Binary exclusion:
  - The archiver explicitly excludes binary files even if they slip
    past other rules.
  - STAN logs a concise summary to the console when creating archives.
    No warnings file is written.

- Large text call‑outs:
  - STAN identifies large text files (by size and/or LOC) as candidates
  - for exclusion and logs them to the console (suggesting globs to add
    to `excludes` if desired).

- Preflight baseline check on `stan run`:
  - Compare `<stanPath>/system/stan.system.md` to the packaged baseline
    (dist). If drift is detected, warn that local edits will
    be overwritten by `stan init` and suggest moving customizations to
    the project prompt; offer to revert to baseline.

- Version CLI:
  - `stan -v`/`--version` prints STAN version, Node version, repo root,
    resolved `stanPath`, and doc baseline status (in sync vs drifted;
    last docs version vs current).

# Inputs (Source of Truth)

- Primary artifacts live under `<stanPath>/output/`:
  - `archive.tar` — full snapshot of files to read.
  - `archive.diff.tar` — only files changed since the previous snapshot (always written when `--archive` is used).
  - Script outputs (`test.txt`, `lint.txt`, `typecheck.txt`, `build.txt`) — deterministic stdout/stderr dumps from configured scripts. When `--combine` is used, these outputs are placed inside the archives and removed from disk.
- When attaching artifacts for chat, prefer attaching `<stanPath>/output/archive.tar` (and `<stanPath>/output/archive.diff.tar` when present). If `--combine` was not used, you may also attach the text outputs individually.
- Important: Inside any attached archive, contextual files are located in the directory matching the `stanPath` key from `stan.config.*` (default `.stan`). The bootloader resolves this automatically.
