# Dependency-state exploration enforcement (context mode)

- Issue observed in `stan-cli` docs build (TypeDoc validation enabled): TypeDoc warns that a type is referenced by an exported/public surface but “not included in the documentation”.
- Example warning shape: “`<Type>`, defined in `<path>`, is referenced by `<publicSymbol>.<prop>` but not included in the documentation”.
- Typical cause: a type appears in an exported signature (so it must be documented), but is not reachable from the TypeDoc entrypoint exports and/or is suppressed via `@hidden`/`@internal`. Fix should be: export the referenced symbol from the public surface (and ensure it is not hidden), not silencing TypeDoc.

## Why this message

Even with dependency-graph mode active (`--context`), assistants can mistakenly ask users to paste file contents instead of using `dependency.state.json` to deterministically stage the needed files into the next archive. This breaks the intended “archive is source of truth” workflow.

## Proposed system-prompt tightening (stan-core packaged prompt)

Add/strengthen a hard rule in the “Dependency graph mode” and/or “Discovery Protocol” sections:

- If dependency graph mode is active (thread-sticky), the assistant MUST NOT request users to paste in-repo file contents (or go hunting) to diagnose an issue.
- Instead, the assistant MUST update `<stanPath>/context/dependency.state.json` to explicitly select the needed repo-relative paths, then ask for a new `stan run --context` archive/diff.
- The only allowed exceptions:
  - the file contents are already present in the currently attached archive, or
  - the user explicitly refuses to run another archive cycle and insists on manual paste, or
  - the target is outside the repo/graph and cannot be staged via dependency selection.

Suggested wording snippet (drop-in):

> When dependency graph mode is active and you need additional code context, you MUST use `dependency.state.json` to stage the exact paths you need into the next archive. Do not ask the user to paste file contents for in-repo files unless the user explicitly declines running `--context` again.

## Optional enforcement nudge

- Add an “assistant-side check” line: if a user request or error log references `src/...` paths not present in the current archive, default response is to seed `dependency.state.json` with those paths (depth 0–1) and request a new archive.
