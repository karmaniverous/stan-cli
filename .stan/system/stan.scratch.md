# Scratch: DRY pass (export-shape resolvers)

- Objective: Reduce duplication in “named/default export shape” resolution logic used for SSR/Vitest/mock robustness.
- Change: Added a shared resolver `resolveCallableExport` (+ `tryResolveCallableExport`) in `src/common/interop/resolve.ts`.
- Update: Fixed `no-unnecessary-type-parameters` and `no-unnecessary-condition` lint errors in the new helpers.
- Refactor targets updated to use it:
  - archive-stage import pickers (`archivePhase`, `stageImports`)
  - archive-stage resolver (`runArchiveStage`)
  - snap-run capture resolver (`captureSnapshotAndArchives`)
  - patch local shim (`runGitApply`)
  - runner UI constructor lookup (`LiveUI`, `LoggerUI`)
- Next: Continue DRY pass by migrating remaining bespoke “named-or-default” pickers (only where it improves clarity and keeps behavior identical).