# CLI decomposition — safe deletions in stan-cli

Context
- stan-core now provides the engine (config, selection, archiving/diff/snapshot, patch engine, imports staging, validator, prompt helpers). stan-cli should depend on these and remove its duplicated engine modules.

Safe to delete in stan-cli (engine duplicates)
- Config loaders/parsers
  - Any local implementations of: loadConfig/loadConfigSync, resolveStanPath/resolveStanPathSync, schema/normalization helpers.
- Selection and FS helpers
  - File tree enumeration and filtering (listFiles, filterFiles), reserved workspace path logic.
- Archive/diff/snapshot logic
  - Tar creation, file classification (binary exclusion, large text call‑outs), diff archive selection and snapshot write/read/sentinel handling.
- Patch engine internals
  - detectAndCleanPatch, applyPatchPipeline (git apply attempts + jsdiff fallback), applyWithJsDiff, parse/diagnose helpers, and File Ops (parse/execute/write debug).
- Imports staging
  - Any local staging/mirroring under <stanPath>/imports/**.
- Response-format validator
  - validateResponseMessage and its helpers.
- Prompt helpers used by preflight/injection
  - getPackagedSystemPromptPath, assembleSystemMonolith (dev‑only helper).

Keep in stan-cli (CLI/adapter concerns)
- Commander command trees, flag parsing, help/usage, error messages.
- Runner orchestration: TTY vs BORING, live logger/table, labels, status lines.
- Input acquisition and presentation:
  - Clipboard/file/argument precedence, default file handling.
  - Writing cleaned patch to <stanPath>/patch/.patch.
  - Editor open (code -g {file}), banner/UX, diagnostics envelope printing.
- Cancellation and signal handling; late‑cancel guard before archiving.
- --core loader and banner (dist/src/auto), prompt injection from selected core.
- Interop thread writer and aggressive pruning (File Ops to remove resolved notes).

Imports to use from @karmaniverous/stan-core (examples)
- Config
  - import { loadConfig, loadConfigSync, resolveStanPath, resolveStanPathSync } from '@karmaniverous/stan-core/stan/config';
- Selection/FS, archive/diff/snapshot, imports, validator, prompt helpers
  - import { createArchive, createArchiveDiff, writeArchiveSnapshot, listFiles, filterFiles, prepareImports, validateResponseMessage, getPackagedSystemPromptPath, assembleSystemMonolith } from '@karmaniverous/stan-core/stan';
- Patch engine
  - import { detectAndCleanPatch, applyPatchPipeline, parseFileOpsBlock, executeFileOps } from '@karmaniverous/stan-core/stan/patch';

Adapter flow (reference)
1) Acquire raw patch text (arg/file/default/clipboard).
2) cleaned = detectAndCleanPatch(raw) // from core
3) Write cleaned to <stanPath>/patch/.patch
4) applyPatchPipeline({ cwd, patchAbs, cleaned, check }) // from core
5) Present outcomes (diagnostics envelope, editor open), no engine logging.

Notes
- Prefer imports from '@karmaniverous/stan-core/stan' (top‑level barrel) or sub‑barrels shown above for clarity.
- Remove any console‑color/status helpers that leaked into engine copies; CLI keeps its own presentation layer.
- Delete redundant unit tests that target engine internals and keep adapter/integration tests that exercise CLI behavior over core APIs.

Next actions
- Switch imports in stan-cli to the core surfaces above, then remove duplicated modules.
- Run CLI tests; add adapter/loader tests for --core and diagnostics envelopes.
