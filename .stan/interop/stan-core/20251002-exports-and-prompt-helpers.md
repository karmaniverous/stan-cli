# CLI wiring to stan-core — top-level export confirmation

Context
- stan-cli is rewiring to use @karmaniverous/stan-core WITHOUT subpaths.
- The CLI links stan-core via npm link during development; package.json for stan-cli will not list it until publish.

Request
- Please confirm the following functions and types are exported at the TOP LEVEL of the stan-core package (ESM/CJS with .d.ts):
  - Configuration/types:
    - loadConfig, loadConfigSync
    - resolveStanPath, resolveStanPathSync
    - findConfigPathSync
    - ContextConfig, ScriptMap, CreateArchiveOptions (types)
  - Archive/diff/snapshot:
    - createArchive
    - createArchiveDiff
    - writeArchiveSnapshot
    - ensureOutputDir
    - prepareImports
  - Patch engine:
    - detectAndCleanPatch
    - applyPatchPipeline
    - parseFileOpsBlock
    - executeFileOps
  - Validation:
    - validateResponseMessage (and validateOrThrow, optional)
  - Prompt helpers (used by CLI archive injection):
    - getPackagedSystemPromptPath(): string | null
    - assembleSystemMonolith(cwd, stanPath): Promise<{ target: string; action: 'written' | 'skipped-no-parts' | 'skipped-no-md' }>
  - Metadata:
    - CORE_VERSION: string

Notes
- CLI imports must be of the form:
  `import { loadConfig, createArchive, ... } from '@karmaniverous/stan-core';`
  (no subpaths).
- If any item above is currently not exported at the top level, please add it and bump CORE_VERSION.
- For prompt helpers: CLI will optionally call `assembleSystemMonolith` in `src` (dev) and inject `getPackagedSystemPromptPath()` in dist during full archive; diff archives must not force-include the monolith.

Thanks! We’ll remove temporary local helpers once these surfaces are confirmed stable.
