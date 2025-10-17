# ACK — Facet Overlay: alignment, confirmations, and next steps

Thanks for the clear response (20251017-170900Z). We’re aligned on the design and the division of labor:

- Overlay composition remains in stan-cli (owner of presentation/selection).
- stan-core adds a minimal “anchors” channel to selection surfaces so anchors can re‑include over repo/overlay excludes while still respecting reserved denials.
- Ramp‑up safety (“no anchors → don’t hide; warn”) stays in stan-cli.
- Binary CLI toggle (`--facets`/`--no-facets`) + per‑run `-f/-F` name arrays are the only flags; overlays do not rewrite state on disk for the run.

Below are confirmations, minor clarifications, and a proposed sequencing plan.

---

## Agreement (summary)

- Files:
  - `.stan/system/facet.meta.json` — durable, versioned; name → { exclude[], include[] }.
  - `.stan/system/facet.state.json` — ephemeral, gitignored; name → boolean (true active, false inactive; absent ⇒ active).
- Semantics with `--facets` on:
  1. Start from engine selection (repo .gitignore + includes + excludes + reserved denials).
  2. Drop union of `exclude` globs for facets that are inactive for this run.
  3. Add back union of all anchors from facet.meta.json `include` (always included).
  4. Reserved denials remain authoritative (anchors cannot override).
- CLI flags/overrides:
  - `--facets`/`--no-facets` toggle the overlay.
  - `-f name…` (arrays) = set those facets active for the run; overlay on.
  - `-F name…` (arrays) = set those facets inactive for the run; overlay on.
  - Naked `-f` = overlay on, treat all facets as active (no hiding).
  - Naked `-F` = same as `--no-facets` (ignore overlay).
  - If a facet appears in both lists, `-f` wins (safer: include code).
- Plan printing: reuse `--plan` to show “Facet view”: inactive facets, anchors kept, and any auto‑suspended facets (missing anchors).
- System prompt addendum: the assistant must read facet files every turn, never carve without anchors, update anchors with code changes, and treat selection diffs as view expansion.

---

## Core API changes (accepted)

Add optional `anchors?: string[]` to selection surfaces, evaluated **after** excludes and .gitignore, with reserved denials still applied:

- `createArchive(cwd, stanPath, { includes?, excludes?, anchors? })`
- `createArchiveDiff({ cwd, stanPath, baseName, includes?, excludes?, anchors?, ... })`
- `writeArchiveSnapshot({ cwd, stanPath, includes?, excludes?, anchors? })`
- Internal `filterFiles(..., { includes?, excludes?, anchors? })` if it helps implementation/testing.

Anchor precedence:

- Anchors re‑include paths even if repo excludes or overlay excludes would drop them.
- Anchors do not override reserved denials (`.git/**`, `<stanPath>/diff/**`, `<stanPath>/patch/**`, and output archive files; plus binary screening).

This matches the overlay spec and lets CLI pass a simple pair: (excludesOverlay, anchorsOverlay).

Optional (nice‑to‑have, not blocking):

- Export a tiny glob matcher helper so CLI can preview plan details with engine‑parity semantics:
  - e.g., `makeGlobMatcher(patterns: string[]): (relPath: string) => boolean`
  - Same normalization/flags as engine (POSIX paths, dot handling, etc.).

---

## Confirmations (please ACK/adjust)

1. Reserved denials — canonical list
   - Confirm the reserved set core will always exclude (and anchors must never override):
     - `.git/**`
     - `<stanPath>/diff/**`
     - `<stanPath>/patch/**`
     - `<stanPath>/output/archive.tar`, `<stanPath>/output/archive.diff.tar` (and any future archive outputs)
     - Binary screening (classifier) remains in effect; anchors do not re‑include binaries.

2. Includes vs excludes vs anchors precedence (documentation line)
   - Proposed wording:
     - “includes” (ContextConfig) continues to override .gitignore but **not** excludes.
     - “excludes” takes precedence over “includes”.
     - “anchors” override both “excludes” and .gitignore (subject to reserved denials).
   - Please confirm this is the intended precedence order we should document.

3. Path normalization
   - CLI will provide POSIX repo‑relative globs; core already normalizes paths. Please confirm no additional escaping/flags are required (we’ll mirror core’s glob semantics in docs).

4. Snapshot & diff
   - We will pass `anchors` to both snapshot and diff surfaces so anchors participate consistently in the selection set for both.
   - Please confirm this matches your intent.

---

## stan-cli work (overlay owner)

Implementation outline:

1. Read facet.meta.json (durable) and facet.state.json (ephemeral).
2. Determine inactive facets for the run:
   - apply per‑run overrides (`-f`/`-F` with arrays), else facet.state.json, else default active.
3. Build overlay:
   - `excludesOverlay = ∪(inactiveFacet.exclude)`
   - `anchorsOverlay = ∪(all facet.include)`
4. Ramp‑up safety (no anchors):
   - For each facet that is inactive, if no anchor exists under the excluded subtree(s), auto‑suspend the drop **for this run only** (treat facet as active), and print:
     - `stan: facet "<name>": no anchors found; kept code this run. Add an anchor in facet.meta.json include and re-run.`
5. Call core with:
   - `includes` = repo config includes (unchanged),
   - `excludes` = repo config excludes ∪ excludesOverlay,
   - `anchors` = anchorsOverlay.
6. Plan output:
   - Append a “Facet view” section under `--plan` with: inactive facets & roots, anchors kept, any auto‑suspended facets (missing anchors), and any per‑run overrides in effect.
7. Archives:
   - Include both facet files in archives so the assistant can see/verify the applied view.
8. No mutations:
   - Per‑run overrides do not rewrite facet.state.json (on‑disk); they are in‑memory for the run.

Flags (final):

```
--facets           # apply overlay
--no-facets        # ignore overlay
-f name1 name2 …   # overlay ON; set these facets active for this run
-F name1 name2 …   # overlay ON; set these facets inactive for this run
-f                 # overlay ON; treat all facets as active (no hiding)
-F                 # same as --no-facets (ignore overlay)
# if a facet appears in both lists, -f wins (active)
```

---

## System prompt addendum (assistant obligations)

We’ll add a concise addendum so the assistant honors the overlay every turn:

1. Read facet.meta.json and facet.state.json (or their copies inside the archive) before starting; treat large diffs after selection changes as view expansion.
2. Never request a carve‑out that would hide code without an anchor doc; create/designate the anchor first, then flip the facet inactive.
3. When code changes a module’s public surface or invariants, update (or create) the anchor doc in the same patch.
4. Use the toggle intentionally: prefer `--facets` for steady threads; switch to `--no-facets` when jumping to a new area or starting a new thread.
5. Keep facet edits auditable (meta in git; state ephemeral but included in archives).

---

## Sequencing & tests

Order:

1. Core: add `anchors?: string[]` to selection surfaces; implement precedence; unit tests:
   - anchors override excludes and .gitignore,
   - anchors blocked by reserved denials,
   - zero anchors = no change from current behavior.
   - (Optional) export matcher helper for CLI parity.
2. CLI: implement overlay composition and ramp‑up safety; pass excludes/anchors to core; add plan printing; add flags; integration tests:
   - -f/-F arrays, naked forms, and precedence,
   - inactive facet with anchors (docs-only view) vs without (auto‑suspend + warn),
   - overlaps across facets (drop unless anchored),
   - archives include facet files; plan output accurate.
3. Prompt: add the addendum.

If you can provide a target version for the core change, we’ll stage CLI work behind a version guard and flip it on once the release lands.

---

## Close

We appreciate the minimal core change — it keeps responsibilities clean and gets us the exact precedence we need. Please review the confirmations (reserved denials list, precedence text, snapshot/diff anchors) and we’ll proceed accordingly. Happy to adjust names (`anchors` vs `forceIncludes`) if you prefer a different term in the API.
