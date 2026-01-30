# Scratch: Fix context snapshot keying

- Objective: Ensure `stan snap` updates the context snapshot (`.archive.snapshot.context.json`) with the full allowlist (Base + Closure) so subsequent runs don't diff base files as new.
- Fix: Use `createContextArchiveDiffWithDependencyContext` in `stan snap` (with `updateSnapshot: 'replace'`) to guarantee the snapshot baseline uses the exact same selection logic (Base + Closure) as `stan run`.
- Context mode Option B: `stan run --context` writes FULL+DIFF; `stan snap` must baseline both.