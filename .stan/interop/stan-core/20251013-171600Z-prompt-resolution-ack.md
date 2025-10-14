# ACK — prompt resolution (global CLI + nested core)

We received and accept `20251013-170500Z-prompt-resolution-tests.md`. Plan for stan‑cli:

- Helper: add `resolveCorePromptPath()` that:
  - Primary: uses `getPackagedSystemPromptPath()` from `@karmaniverous/stan-core`.
  - Fallback: uses `createRequire(import.meta.url)` to `resolve('@karmaniverous/stan-core/package.json')`
    and then `path.join(<root>,'dist','stan.system.md')`. This handles global installs and
    paths with spaces (e.g., “Program Files” on Windows).

- Tests:
  - Unit tests covering:
    - local prompt present (prefer local),
    - packaged prompt present (fallback to core),
    - fallback branch with spaces in path,
    - plan‑only (`stan run -p`) prints `prompt: core` when no local prompt exists.
  - Optional: under `STAN_DEBUG=1`, log a single debug line with selected source/path
    (e.g., `stan: debug: prompt: core <absPath>`), without changing normal output.

- Follow‑through:
  - After merge/verification, we’ll prune this interop note and any now‑stale related interop,
    and we’ll remove imports of core interop threads from this repo where appropriate to keep
    archives lean.

Thanks — proceeding on our side.
