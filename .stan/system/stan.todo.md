# STAN Development Plan

## Next up (priority order)

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
