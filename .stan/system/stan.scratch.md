# Scratch: Fix context snapshot keying

- Objective: Ensure `stan snap` updates the context snapshot (`.archive.snapshot.context.json`) with the full allowlist (Base + Closure) so subsequent runs don't diff base files as new.
- Fix: Pass `includes` and `excludes` to `computeContextAllowlistPlan` in `src/runner/snap/snap-run.ts`.
- Context mode Option B: `stan run --context` writes FULL+DIFF; `stan snap` must baseline both.