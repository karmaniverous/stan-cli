# Interop: context-mode “stop-and-stage” prompt gate

## Problem observed (stan-cli thread)

- In dependency graph mode, the assistant drafted unified-diff patches for repo files (e.g. `src/...`) without having those file bodies loaded into the thread via an archive.
- The assistant incorrectly treated “path exists / is listed in `dependency.meta.json`” as “safe to patch,” which violates the intent of load-before-edit.
- The correct first action should have been: patch `<stanPath>/context/dependency.state.json` to stage the exact files, request a new `stan run --context` archive, then patch based on the staged contents.

## Why this happened

- Current prompt language expresses load-before-edit as a rule, but it does not force a mechanical control-flow branch before emitting patches.
- It is too easy for an assistant to (wrongly) assume “repo snapshot exists somewhere” or “meta lists it” implies “content is loaded.”
- The “`dependency.state.json: no change`” escape hatch can be incorrectly used even when additional in-repo context is required to act safely.

## Suggested system-prompt changes (to drive correct first-try behavior)

Add a context-mode hard gate:

- If dependency graph mode is active and the assistant intends to patch any file outside `<stanPath>/system/**`, it MUST first confirm each target file is present in the current archive’s extracted contents.
- If any target file is not present, the assistant MUST NOT emit speculative patches. It MUST ONLY emit patches for:
  - `<stanPath>/context/dependency.state.json`
  - `<stanPath>/system/stan.scratch.md`
  - `<stanPath>/system/stan.todo.md`
  - plus a commit message
  and request a new `stan run --context` archive/diff.

Add a mandatory “Target-file availability checklist”:

- Before any Patch blocks, list intended patch targets and mark `present in current archive: yes/no`.
- If any “no”, stop and stage via `dependency.state.json`.

Tighten the “no change” rule:

- `dependency.state.json: no change` is only allowed when the assistant is not missing any in-repo file contents required to complete the requested fix.
- `dependency.meta.json` alone never counts as “file loaded.”

## Expected result

- Prevents guessy patches and enforces the dependency-state workflow automatically in context-mode threads.
