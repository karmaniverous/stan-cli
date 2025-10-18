# Interop — Facet‑aware editing guard (require facet enablement before edits)

## Summary

- Problem: The assistant attempted to edit a document that exists in the repo but was excluded from the attached archives by the facet overlay (e.g., `docs-src/**` under a “docs” facet). This violates the “integrity‑first intake” expectation because the target file wasn’t present in the source of truth (archives).
- Impact: The assistant may propose patches for paths it cannot see, leading to context drift and failed patch rounds.
- Proposal: Add a system‑prompt rule (authored in stan-core) that requires the assistant to detect overlay state and explicitly enable the relevant facet before proposing edits or new files within that facet.

## Why the system allowed this attempt

These sections collectively incentivize edits even when a facet may be inactive:

- “Mandatory documentation cadence (gating rule)”
  - Requires updating `<stanPath>/system/stan.todo.md` and proposing doc updates alongside code patches. This can legitimately include documentation under facetized areas (e.g., `docs-src/**`) for some repos.
- “Always‑on prompt checks”
  - Directs the assistant to keep requirements and dev plan current and to propose prompt/policy updates when durable decisions emerge. These can land under facetized roots (for some repos).
- “Response Format (MANDATORY)”
  - Requires patches for changed files; without facet awareness, the assistant may target files that are currently excluded by overlay.
- “Facet overlay (CLI owner)” (in requirements)
  - Documents overlay behavior but does not require the assistant to detect facet inactivity before proposing edits to files under that facet’s excluded roots.

In short, our own documentation cadence and default task policies encourage edits, while the overlay may hide those targets from the archives that the assistant consumes.

## Proposed system‑prompt change (stan‑core)

Add a “Facet‑aware editing guard” under “Always‑on prompt checks” (or adjacent) in `stan.system.md`:

1. Detection
   - Read `.stan/system/.docs.meta.json` and, when present, inspect `overlay.enabled` and `overlay.effective` (boolean per facet).
   - Read `.stan/system/facet.meta.json` to map facet names to their `exclude` roots and `include` anchors.
   - Given a candidate target path, determine the facet(s) whose excluded roots cover that path (normalized POSIX paths; treat `/**`/`/*` tails as subtree roots).

2. Guardrail (hard rule)
   - If `overlay.enabled === true` AND the resolved facet’s `effective[facet] === false` (inactive), the assistant MUST NOT propose a patch or creation for any file under that facet’s excluded roots in this turn.
   - Instead, the assistant MUST:
     - Explain that the path resides under an inactive facet and cannot be safely edited without enabling the facet, and
     - Propose to enable the facet for the next run, e.g.:
       - “Please re‑run: `stan run -f <facet>` (overlay ON; include anchors; no hiding for this facet),” or
       - “Temporarily disable overlay: `stan run -F`,” or
       - “(Optional) Toggle `<stanPath>/system/facet.state.json` for persistent local activation.”
   - Only after the user enables the facet (or disables overlay) should the assistant propose patches that target files under that facet’s excluded roots.

3. Algorithm sketch (assistant‑side; all POSIX‑normalized):
   - Load `.stan/system/.docs.meta.json`:
     - If `overlay.enabled !== true`, skip this guard.
     - Otherwise, collect `effective: Record<string, boolean>`.
   - Load `.stan/system/facet.meta.json`:
     - For each facet, compute normalized excluded roots by stripping glob tails: `/**` → `/`, `/*` → `/`; trim trailing slashes.
   - For each intended patch target path:
     - Find facets whose excluded roots are ancestors of the target path.
     - If any such facet is `effective=false`, block the edit and produce an activation instruction as above.

4. Validator extension (soft recommendation)
   - Extend the assistant’s pre‑send validation (non‑normative, doc text only) to check that no Patch block targets a path under an inactive facet when overlay is enabled. If found, fail composition and re‑emit with an activation request instead of a patch.

## Optional CLI/metadata improvement (for assistants)

While the current metadata is sufficient (`.docs.meta.json` + `facet.meta.json`), we propose optionally enriching `.docs.meta.json` so assistants can avoid parsing glob semantics:

```json
{
  "overlay": {
    "enabled": true,
    "effective": { "docs": false, "tests": true, "live-ui": true },
    "facetRoots": {
      "docs": ["docs-src"],
      "tests": ["src/test", "src/test-support", "**/*.test.ts"],
      "live-ui": [
        "src/runner/run/live",
        "src/runner/run/ui",
        "src/runner/run/progress",
        "src/runner/run/presentation",
        "src/anchored-writer"
      ]
    }
  }
}
```

- Rationale: A normalized `facetRoots` map reduces guesswork for assistants; they can match simple subtree roots quickly and conservatively skip patterns that are not pure subtrees (e.g., leaf globs like `**/*.test.ts`, which will not be “edited”).
- Note: The assistant still must respect reserved denials (documented by core/CLI) and binary screening.

## Rationale & benefits

- Aligns assistant behavior with “integrity‑first intake”: do not propose diffs against files not present in archives.
- Prevents churn where the assistant proposes patches that the CLI cannot validate/apply without changing overlay configuration.
- Keeps the overlay ON by default while offering a clear, deterministic path to enable targeted facets when edits are needed.

## Concrete wording (suggested insertion in system prompt)

> Facet‑aware editing guard
>
> - Before proposing any Patch or new file under a facetized subtree, read `<stanPath>/system/.docs.meta.json` (overlay state) and `<stanPath>/system/facet.meta.json` (facet roots/anchors).
> - If overlay is enabled and the facet covering the target path is inactive, do not propose the edit in this turn. Instead, instruct the user to enable the facet (e.g., `stan run -f <facet>`) or disable overlay (`stan run -F`) and resume after the next run.
> - Only propose patches for files under a facet when that facet is active (or overlay is disabled). This preserves integrity by ensuring targets exist in the attached archives.

## Next steps

1. stan‑core:
   - Update `stan.system.md` with the guard text above (placement: under “Always‑on prompt checks” or a new “Facet‑aware editing guard” subsection).
   - (Optional) Consider enriching `.docs.meta.json` with `overlay.facetRoots` for assistant‑friendly lookups.
2. stan‑cli:
   - No changes required (metadata already persisted). Optional: include a short one‑liner in the plan footer when a facet is inactive and scripts/patches might target it (UX hint only).
3. Tests/docs:
   - Add a unit that an assistant (or validator mock) refuses to patch an inactive facet path and instead emits activation instructions.
   - Document the guard briefly in assistant guidelines.

— end —
