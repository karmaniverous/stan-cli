# Response — Facet Overlay (stan-core feedback)

Summary
- Keep overlay composition in stan-cli (owner of presentation/selection).
- Provide a minimal core hook to let anchors re-include over repo excludes while still respecting reserved denials.
- Optionally expose a tiny glob matcher helper so CLI can reuse engine semantics where needed.

Alignment
- Binary toggle in CLI (`--facets` / `--no-facets`) and per-run `-f/-F` overrides make sense.
- Ramp-up safety (“no anchors found → do not hide; warn”) belongs in CLI.
- Reserved denials must remain authoritative: `.git`, `<stanPath>/diff`, `<stanPath>/patch`, and output archive files; anchors must not override these.

Minimal engine changes (proposal)
1) High-precedence anchors in selection
   - Add an optional “anchors” (aka “forceIncludes”) channel to core selection that re-includes files even when excluded by repo config or overlay excludes. Reserved denials still apply.
   - API sketches:
     - filterFiles(files, { ..., anchors?: string[] })
     - createArchive(cwd, stanPath, { ..., includes?, excludes?, anchors? })
     - createArchiveDiff({ ..., includes?, excludes?, anchors? })
     - writeArchiveSnapshot({ ..., includes?, excludes?, anchors? })
   - Semantics:
     - anchors are evaluated after excludes and .gitignore/default denials.
     - anchors re-include paths into the final set unless a reserved denial applies.
     - includes continue to override .gitignore but not excludes; anchors override both excludes and .gitignore (subject to reserved).
   - Rationale:
     - This matches the overlay spec: “anchors re-include over repo excludes, never over reserved denials.”
     - Keeps CLI overlay simple: inactive facets accumulate excludes; anchors accumulate into anchors; CLI passes both to the engine.

2) Optional matcher helper for CLI (nice-to-have)
   - Export a small helper to compile engine-style glob matchers so CLI can precompute “inactive facet” drops and anchor presence checks without drifting semantics.
   - Example surface (illustrative only):
     - makeGlobMatcher(patterns: string[]): (relPath: string) => boolean
     - Behavior should match core’s picomatch usage (`dot: true`, prefix handling, POSIX normalization).
   - This is optional because CLI can defer the final truth to core by passing excludes/anchors; but a helper reduces duplication when CLI wants to preview plan details.

Reserved denials precedence (confirm)
- Reserved workspace paths remain excluded regardless of overlay state or anchors:
  - `<stanPath>/diff/**`, `<stanPath>/patch/**`, `<stanPath>/output/{archive.tar,archive.diff.tar,archive.warnings.txt}`, and `.git/**`.
- Anchors must not override these exclusions.

CLI composition guidance (overlay owner)
1) Determine inactive facets for the run (per-run overrides > facet.state.json > default active).
2) Build overlay inputs:
   - excludesOverlay = union of all inactive facet “exclude” lists.
   - anchorsOverlay = union of all facet “include” anchors (always included).
3) Ramp-up safety:
   - For each inactive facet, if no anchor exists under its excluded subtree(s), auto-suspend that facet’s drop for this run and print:
     - stan: facet "<name>": no anchors found; kept code this run. Add an anchor in facet.meta.json include and re-run.
4) Call core with:
   - includes: from repo config (unchanged).
   - excludes: union(repo excludes, excludesOverlay).
   - anchors: anchorsOverlay (new).
5) Plan output:
   - Print “Facet view”: inactive facets (roots), anchors kept, any auto-suspended facets, and effective per-run overrides.

Pitfalls & notes
- Path normalization: use POSIX-style rel paths for all overlay patterns; core APIs already normalize.
- Sub-packages: core’s default sub-package exclusion remains in effect; anchors can re-include content under sub-packages if desired (subject to reserved denials).
- Performance: anchors are a small allowlist; costs are negligible versus normal selection.
- Binary screening: core’s archive-time classifier continues to exclude binaries; anchors do not change that policy.

Next steps
- Core:
  - Add anchors?: string[] to filterFiles, createArchive, createArchiveDiff, writeArchiveSnapshot.
  - Implement anchors re-include after excludes, with reserved denials still applied.
  - (Optional) Export makeGlobMatcher for CLI parity.
  - Add unit tests: anchors override excludes (.gitignore and repo excludes), anchors blocked by reserved, unchanged behavior when anchors empty.
- CLI:
  - Compose overlay per proposal; pass excludes/anchors to core.
  - Implement ramp-up safety and “Facet view” plan print.
  - Include facet.meta.json and facet.state.json in archives for assistant awareness.

Decision
- Keep overlay ownership in stan-cli.
- Introduce minimal “anchors” hook in stan-core for deterministic, precedence-safe re-inclusion aligned with the overlay spec.
