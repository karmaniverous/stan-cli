# STAN Development Plan

When updated: 2025-10-01 (UTC)

This plan tracks two synchronized tracks in preparation for splitting the code base into two packages: stan-core (engine) and stan-cli (CLI/runner). Until the repo is duplicated, both tracks live here; after duplication, each repo will retain only its corresponding track.

---

## Track A — stan-core (engine)

### Next up (priority order)

- Extract engine package scaffolding
  - Create a new repo/package “@karmaniverous/stan-core”.
  - Copy engine modules:
    - config/, fs.ts, fs/reserved.ts, paths.ts
    - archive.ts (+ archive/constants.ts), archive/util.ts (return warnings)
    - diff.ts, snap/{capture,shared,context}.ts
    - patch/\*\* (apply, jsdiff, detect, headers, parse, file-ops, diag/util, run/pipeline, util/fs)
    - imports/stage.ts
    - validate/response.ts (optional export)
  - Remove CLI/runner/process/TTY concerns.

- Remove console I/O from core
  - Replace console.log in archive/util.ts with a return value (warningsBody) surfaced to the caller.
  - Ensure snap history helpers return data/events only.

- Patch ingestion — creation fallback (new)
  - Implement “creation patch” heuristic in stan-core:
    - When unified‑diff application fails and the patch is confidently detected as a new-file creation (e.g., /dev/null → b/<path>), strip diff headers and decode body by removing leading “+” from each payload line.
    - Normalize to LF and create parent directories for nested paths.
    - Gate behind the standard pipeline: only runs after git/jsdiff fail and only for new-file patches.
  - Add unit tests covering:
    - Simple creation, nested path, fenced chat artifacts, sandbox (check=true).

- API surface and types
  - Export public APIs listed in stan.requirements.md; ensure stable d.ts.
  - Document return contracts where logging was removed.

- Imports bridge (context from cli)
  - Add a task to configure imports in stan-core’s stan.config.yml:
    - label: “cli-docs”
    - patterns: paths to staged stan-cli docs (README, CHANGELOG, docs/).

- Cross‑repo recommendation
  - Update stan.project.md in stan-core with a section that instructs the assistant to recommend stan-cli changes for any adapter/UX concerns.

- Packaging & CI
  - Rollup build for library + d.ts bundle (no CLI bundle).
  - Ensure tar & fs-extra are runtime deps; no Commander/inquirer/log-update.
  - Publish under a pre-release tag for initial integration.

### Backlog / follow‑through

- Performance profiling for large repos (selection and tar streaming).
- Optional logger injection pattern (future) to support structured logging.

---

## Track B — stan-cli (CLI and runner)

### Next up (priority order)

- Wire stan-cli to stan-core
  - Replace internal imports with “@karmaniverous/stan-core” APIs:
    - config loading, selection, archive/diff, snapshot, patch pipeline, imports staging.
  - Keep CLI behaviors: preflight/docs injection, plan printing, live/logger UI, cancellation gates, editor open, clipboard source.

- Archive warnings display
  - Print stan-core’s warningsBody once per archive/diff phase in CLI.

- Runner cancellation hardening
  - Ensure the sequential scheduling gate prevents “after” scripts from starting after a SIGINT boundary; preserve late‑cancel guard before archive.

- Help/UX parity
  - Confirm BORING vs TTY parity on labels and summary lines.
  - Verify defaults tagging and conflict messages.

- Imports bridge (context from core)
  - Add a task to configure imports in stan-cli’s stan.config.yml:
    - label: “core-docs”
    - patterns: paths to staged stan-core API docs and changelog.

- Cross‑repo recommendation
  - Update stan.project.md in stan-cli with a section that instructs the assistant to recommend stan-core changes for any engine concerns (selection/patch/archiving semantics).

- Tests & docs
  - Keep existing CLI/runner integration tests; adjust to stan-core wiring.
  - Update README/help footers if flags/wording changed.

### Backlog / follow‑through

- Live table final-frame flush audit for edge cases.
- Editor-open gating policy doc (“test mode” and force‑open).

---

## Completed (recent)

- Unified diagnostics envelope and follow-up options clarified.
- Response-format validator improvements and WARN parity across UIs.
- Windows EBUSY mitigation in tests and cancellation paths.
- Imports staging and selection parity improvements.
