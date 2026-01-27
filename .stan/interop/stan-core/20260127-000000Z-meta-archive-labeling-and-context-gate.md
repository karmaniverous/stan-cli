# Meta archive mislabeled as full + prompt guidance request

## What

In `stan-cli`, when generating a meta archive, the live console UI reports the archive as a full archive.

Observed (Windows PowerShell):

- Command: `stan run -Scm`
- Live summary row shows:
  - `Type: archive`
  - `Item: full`
  - `Output: .stan/output/archive.tar`

Expected:

- `Type: archive`
- `Item: meta` (or equivalent label indicating “meta archive”)

## Why this matters

- This is user-visible UX drift: the archive kind shown in the live UI should match the actual mode being executed.
- In context-mode workflows, “meta” vs “full” communicates important expectations about what is included and what the artifact is for (thread opener vs full snapshot).

## Likely root cause (CLI-side)

This appears to be a labeling/reporting issue rather than an archive-generation issue:

- The progress event/row builder is likely hardcoding `item: 'full'` for the archive stage, even when running in meta mode.
- The UI then prints whatever `item` it is given, so it reports “full” incorrectly.

## Cross-repo suggestion (core ↔ CLI contract hardening)

Even if the fix is implemented in `stan-cli`, we may want to harden the engine/CLI boundary by ensuring archive results (from core services) carry an explicit, typed “kind”/“variant” value (e.g., `full | diff | meta`) that the CLI must display, rather than the CLI inferring it from flags.

This reduces future drift when CLI flags or orchestration behavior changes.

## Prompt/process guidance request (system prompt improvement)

During diagnosis, the assistant initially failed to follow the intended dependency-graph workflow and resorted to web search for in-repo source, which risks version skew and violates the “archive artifacts are the source of truth” model.

Proposed additions/clarifications to the packaged system prompt (core-owned baseline):

- Add a “Context Acquisition Protocol” gate:
  - If a reported issue implies a specific wrong label/string/output, require loading the responsible source module(s) before proposing fixes.
  - Prefer dependency graph mode (`dependency.meta.json` → propose `dependency.state.json` selections) over asking the user to paste files manually.

- Clarify dependency-graph usage in discussion-only turns:
  - Even when the user requests “discussion only,” still produce a dependency-state selection plan (paths + rationale), but do not emit patches.

- Add an explicit restriction:
  - No web search for internal repo sources when an archive is available.
  - Web search is only for third-party dependency research (Open-Source First) or time-sensitive external facts, not for locating in-repo files.

- Add a “version skew” warning:
  - External browsing (GitHub, npm docs) is non-authoritative unless the commit/tag is confirmed to match the attached archive.

## Action items

- `stan-cli`: fix live UI labeling so meta-mode archive rows display `meta` (and output naming is consistent with the actual meta-archive contract).
- `stan-core`: consider updating the packaged system prompt baseline to include the context-acquisition gate and “no web search for in-repo code” rule, and consider exposing an explicit archive “kind” in any archive result contract used by CLIs.
