# Testing architecture

Principles
- Pair every non‑trivial module with a test file; co‑locate tests (e.g., `foo.ts` with `foo.test.ts`).
- Favor small, focused unit tests for pure services (ports) and targeted integration tests for adapters/seams.
- Exercise happy paths and representative error paths; avoid brittle, end‑to‑end fixtures unless necessary.

Scope by layer
- Services (pure logic):
  - Unit tests only; no fs/process/network.
  - Table‑driven cases encouraged; assert on types and behavior, not incidental formatting.
- Adapters (CLI/HTTP/etc.):
  - Integration tests over thin slices: verify mapping of input → service → output and edge‑specific concerns (flags, help, conflicts).
  - Mock external subsystems (tar, clipboard, child_process) by default to keep tests fast/deterministic.

Regression and coverage
- Add minimal, high‑value tests that pin down discovered bugs or branchy behavior.
- Keep coverage meaningful (prefer covering branches/decisions over chasing 100% lines).
