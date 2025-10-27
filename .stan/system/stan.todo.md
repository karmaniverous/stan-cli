# STAN Development Plan

## Next up (priority order)

- Lint remediation (strict typed rules)
  - Remove unnecessary Boolean()/String() wrappers where types are already boolean/string.
  - Replace numeric template-literal interpolations flagged by restrict-template-expressions with String(n) (only when not already string).
  - Eliminate unnecessary optional chaining and “no-unnecessary-condition” cases; simplify truthiness checks.
  - Fix tests flagged by require-await (drop async or add awaited ticks) and add at least one assertion where required.
  - Avoid non-null assertions in tests; prefer guarded access or expect().toBeDefined().
  - Sweep for “invalid type of template literal expression” by converting numbers to strings explicitly.
  - Iterate: npm run lint:fix, then npm run lint; keep changes in small, reviewable chunks.

- Knip follow-up (cosmetic)
  - Validate @humanwhocodes/momoa presence (typedoc/eslint types). If no longer required after lint pass, remove; otherwise annotate as intentionally retained.

---

## Completed (append-only, most recent items last)

- ESLint config migration — strict TS flat config + typecheck fix
  - Replaced JS config with strict TS flat config aligned to stan-core.
  - Added @humanwhocodes/momoa as a devDependency to satisfy TypeScript/typedoc resolution for eslint-plugin-jsonc.
- Test stability: SSR/ESM playbook applied; suite green
  - Hoisted fragile exports to declarations to avoid TDZ/SSR races.
  - Resolved peer functions at action time using named‑or‑default resolvers; added minimal fallbacks strictly for tests.
  - Added direct config parsing fallbacks for CLI run defaults and snap stash when loaders are unavailable under SSR/mocks.
  - Installed parse normalization/exit override idempotently on root/sub commands to prevent “unknown command 'node'”.
  - Resolved archive and snap stage functions at call time; validated end‑to‑end with loops across flaky suites.

- Fix SSR plan header styling (renderRunPlan)
  - Avoid direct bold() call under SSR/BORING by guarding with isBoring; preserve styling in TTY.
- Harden Logger UI pre-queue hooks
  - Wrap onScriptQueued/onArchiveQueued in try/catch to prevent presentation hooks from aborting sessions in SSR.

- Root CLI safety: ensure parse normalization/exitOverride always installed
  - In makeCli(), unconditionally call patchParseMethods and installExitOverride (idempotent fallback) to prevent Commander process.exit on unknown options in tests.
- Late-cancel cleanup before/after archive: remove created artifacts when a cancel lands between guards and archive call.

- Facet overlay — archive reduction for lint phase
  - Deactivated: ci, vscode, docs, tests, live-ui (anchors retained).
  - Active: patch, snap, init.
  - Goal: fit broader lint fixes into fewer threads by trimming non-essential trees.
