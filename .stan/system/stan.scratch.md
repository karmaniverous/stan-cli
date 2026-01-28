# Scratch: Context-mode staging must honor dependency state

## Current objective

- Fix `stan run --context` staging so external dependency payloads are staged from the dependency **state-derived allowlist**, not from the entire dependency graph/map.
- Prevent archive bloat/regressions where `archive.tar` and `archive.diff.tar` accidentally include unselected staged externals.

## Notes

- CLI-side hardening: compute the allowlist plan from `dependency.meta.json` + `dependency.state.json`, then filter `dependency.map.json` to that allowlist before archiving.
- Added a smoke test that creates two external deps reachable from different repo files, selects only one seed in state, and asserts only the selected dep is staged/archived.
- Fixups required after initial implementation:
  - `computeContextAllowlistPlan` returns a non-array plan type in current `stan-core` typings; extract the file list before filtering.
  - Ensure mkdirs in the smoke test (`src/` and `node_modules/...`) to avoid Windows ENOENT.

## Next step

- If the issue is actually in `stan-core` staging internals, mirror this guard in core (or accept a filtered map input) so non-CLI consumers remain safe.