# Interop: Dependency graph mode trigger is brittle in diff-only turns

- What happened: In a thread where dependency graph mode was active earlier (dependency meta was present in a full archive), a later turn attached only `archive.diff.tar` (which omitted unchanged `.stan/context/dependency.meta.json`). The assistant treated dependency mode as inactive because it keyed activation to “meta is present in this turn’s archive”, and therefore failed to maintain/update `.stan/context/dependency.state.json`.
- Why this is a real failure mode: `archive.diff.tar` is intentionally incomplete; “not present in this archive” conflates “does not exist / feature off” with “exists but unchanged”.

## Proposed solution (assistant/system policy)

- Make dependency graph mode thread-sticky: once `.stan/context/dependency.meta.json` has been observed anywhere in a thread, treat dependency mode as active for the remainder of the thread unless explicitly disproven (e.g., a later full archive shows it removed).
- When the newest artifact is diff-only and omits the meta file, allow using the last-seen `dependency.meta.json` as the graph for deciding what to include in `dependency.state.json`.

## Optional tooling mitigation (reduces reliance on thread memory)

- Consider always including `.stan/context/dependency.meta.json` (and current `.stan/context/dependency.state.json` when it exists) in context-mode archives as a small “thread header” payload, even when unchanged, so diff-only turns still carry the activation signal.
- Alternatively: emit a dedicated small meta archive on every context-mode run and document that it should be attached at least once per thread.

## Ask

- If you agree, please update the published baseline guidance to treat dependency mode activation as “seen in thread” rather than “present in this turn’s archive”.
