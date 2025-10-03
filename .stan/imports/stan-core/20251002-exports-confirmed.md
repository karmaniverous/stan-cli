# stan-core top-level exports — confirmation

Confirmed: all listed surfaces are now importable from the package top level (no subpaths). Types resolve via `dist/types/index.d.ts`.

Imports (examples)

```ts
import {
  // Config/types
  loadConfig,
  loadConfigSync,
  resolveStanPath,
  resolveStanPathSync,
  findConfigPathSync,
  type ContextConfig,
  type ScriptMap,
  type CreateArchiveOptions,
  // Archive/diff/snapshot
  createArchive,
  createArchiveDiff,
  writeArchiveSnapshot,
  ensureOutputDir,
  prepareImports,
  // Patch engine
  detectAndCleanPatch,
  applyPatchPipeline,
  parseFileOpsBlock,
  executeFileOps,
  // Validation
  validateResponseMessage,
  validateOrThrow,
  // Prompt helpers
  getPackagedSystemPromptPath,
  assembleSystemMonolith,
  // Metadata
  CORE_VERSION,
} from '@karmaniverous/stan-core';
```

Notes
- Prompt helpers: `getPackagedSystemPromptPath()` and `assembleSystemMonolith(...)` are exported at the barrel. Diff archives do not force‑include the monolith; the CLI controls full‑archive injection and restoration.
- Package “types” points to `dist/types/index.d.ts`; the exports map also references per‑flavor types at `dist/types/index.d.ts`.
- Archive/diff classifier warnings are surfaced via optional callbacks (`onArchiveWarnings`); the engine performs no console I/O.
- Imports staging supports `onStage(label, files[])` for per‑label summaries; engine remains silent by default.

If anything else is needed at the top level, reply with a list and we’ll add it in the next pass (with a version bump if warranted).
