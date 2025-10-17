# Proposal — Minimal “Facet Overlay” for Small, Safe Baselines (Request for Feedback)

Audience: stan-core maintainers (engine), with stan-cli context

This note proposes a very small, explicit “facet overlay” to shrink the full archive baseline in ongoing threads while keeping an easy escape hatch back to a complete baseline. The design aims to:

- leverage the existing repo-level include/exclude selection (engine),
- add a simple, optional overlay (CLI) that never hides context silently,
- avoid new semantics beyond “exclude/anchor” and a binary “facets on/off” toggle,
- keep the assistant fully in the loop each turn (system prompt support).

We’re asking for feedback on the division of labor and any engine-facing helpers that would make this safer or simpler.

---

## Context & goal

- Today’s diff archives are small and work well over many turns. The pain is the initial full archive for a new thread: it can consume a lot of context before we even start.
- We want a low-friction way to reduce that first baseline in later threads, without heavy static configuration or brittle summarization pipelines.
- Key constraints:
  - The assistant itself often authors the code and the summary docs it needs.
  - We must never lose visibility silently (no “vanishing facets”).
  - We must preserve a “full baseline” mode for context jumps.

---

## Minimal model (two small JSON files)

Both files live under `.stan/system/` and are included in archives so the assistant knows exactly what overlay was applied for a run.

1) facet.meta.json (durable, versioned in git)

```json
{
  "facetA": {
    "exclude": ["path/**"],
    "include": ["docs/index.md"]
  },
  "facetB": {
    "exclude": ["other/**"],
    "include": ["other/README.md"]
  }
}
```

- `exclude`: paths to hide when this facet is inactive and facets are enabled.
- `include`: “anchors” to always include (docs, indices, READMEs, etc.), regardless of facet state or whether facets are enabled. Anchors re‑include even if repo excludes would drop them (subject to reserved denials: `.git`, `.stan/diff`, binaries).
- This file changes slowly over time as the assistant identifies stable anchors for carved areas.

2) facet.state.json (ephemeral, gitignored)

```json
{
  "facetA": true,
  "facetB": false
}
```

- `true` = active (no overlay effect for that facet),
- `false` = inactive (its `exclude` applies when facets are enabled),
- facets absent from state are treated as active by default (safety).
- This file changes often as the assistant alters its point of view per thread/turn.

---

## CLI toggle & flags (binary and declarative)

- `--facets`: apply the overlay (use meta + state).
- `--no-facets`: ignore the overlay completely (full baseline from repo config). Anchors are still “always included” to preserve breadcrumbs.

- Shorthand per‑run overrides (do not rewrite facet.state.json on disk):
  - `-f` with names: overlay ON, set those facets active for this run only.
    - e.g., `-f plugin-aws templates`
  - `-F` with names: overlay ON, set those facets inactive for this run only.
    - e.g., `-F experimental legacy`
  - `-f` (naked, no names): overlay ON, treat all facets as active (no hiding).
  - `-F` (naked, no names): equivalent to `--no-facets` (ignore overlay).
  - You can combine: `-f a b c -F d e f`; if a facet appears in both lists, `-f` wins (safer: include code).
  - Facets named on CLI but missing in meta → warn in plan output; ignore.

---

## Overlay application (when `--facets` is on)

Order of operations (one pass; no new semantics):

1) Start from engine selection (repo `.gitignore` + includes + excludes + reserved denials).
2) Identify inactive facets for this run:
   - those set to false by per‑run overrides (highest precedence),
   - else from facet.state.json,
   - else default to active if not present in state.
3) Drop any path matching the union of `exclude` from all inactive facets.
4) Add back the union of all `include` anchors from facet.meta.json (anchors always included).
5) Done. Active facets have no effect.

Reserved denials (e.g., `.git`, `.stan/diff`, binaries) always apply and cannot be re‑included by anchors.

### Ramp‑up safety (“no anchors found”)

If a facet is inactive but no anchor (from `include`) exists under its excluded area, **do not hide it**. For this run, auto‑suspend that facet’s drop and print a single warning:

```
stan: facet "<name>": no anchors found; kept code this run. Add an anchor in facet.meta.json include and re-run.
```

This prevents silent loss of context and nudges the assistant to add or designate an anchor document.

---

## Plan output (existing `--plan`)

When `--facets` is on, the run plan prints a short “Facet view” section that shows:

- which facets will be inactive (and the roots they drop),
- which anchors are being kept (from meta.include),
- which facets were auto‑suspended due to missing anchors (“kept code this run”),
- any per‑run CLI overrides that changed on-disk state for this run.

---

## Why this is enough

- One overlay pass, no new vocabulary beyond exclude/include. Anchors solve “docs‑only” without introducing a “keep vs include” distinction.
- Safe by default (no accidental disappearance; inactive facet without anchors is not hidden).
- Organic growth: the assistant adds anchors (new or existing doc indices) and flips booleans in facet.state.json as it learns the repo; no need for a global, static facet map up front.
- Escape hatch: `--no-facets` gives a complete baseline for new threads or big pivots.

---

## System prompt support (critical on every turn)

The assistant must be explicitly guided to:

1) Read facet.meta.json and facet.state.json (or their copies inside the archive) before proceeding, and treat large diffs after selection changes as view expansion (not churn).
2) Never request carve‑outs that drop areas without an anchor. If it wants to hide code under a subtree, it should first add (or designate) a small anchor doc (e.g., README or docs index) and then flip the facet inactive.
3) When changing a module’s public surface or invariants, update (or create) the anchor doc in the same patch so future docs‑only views remain faithful.
4) Use the binary toggle intentionally:
   - prefer smaller baselines with `--facets` for steady threads,
   - flip to `--no-facets` when jumping to a completely different area or starting a new thread.
5) Keep facet edits auditable:
   - facet.meta.json (durable) under version control,
   - facet.state.json (ephemeral) for per-thread view changes,
   - commit messages should mention facet overlay changes explicitly when relevant.

We’ll add a short addendum to the system prompt to codify the above so the assistant honors these behaviors on every turn.

---

## Division of labor (proposal; please critique)

### stan-cli (overlay owner)

- Parse CLI toggles (`--facets`/`--no-facets`, `-f`/`-F` with names) and read facet.meta.json / facet.state.json.
- Compose the overlay result for this run:
  - compute inactive facets (after per‑run overrides),
  - apply `exclude` drops,
  - re‑include anchors (`include`),
  - enforce ramp‑up safety (auto‑suspend drop, warn on missing anchors).
- Print the “Facet view” in the plan (reuse `--plan`).
- Include both JSON files in archives so the assistant sees the exact view.
- Do not mutate facet.state.json for per‑run overrides (they are in‑memory only).
- Keep everything else (run/snap/patch) unchanged.

Implementation note: CLI can derive the final file set by composing the overlay into the existing repo selection (either by building a filtered path list or by augmenting include/exclude globs passed to the engine).

### stan-core (engine)

- No surface change required if the CLI composes the overlay into the inputs it already passes to the engine (current model: engine gets repo selection context and produces archives).
- Keep reserved denials and `.gitignore`/repo include/exclude semantics authoritative.
- Optional: expose a small helper (if you think it helps) to “filter paths by globs” with the engine’s own glob semantics, so the CLI can reuse exactly the engine’s matcher when composing overlays. Not required, but could reduce mismatches, especially across platforms.

Rationale for keeping overlay in CLI:
- It’s a presentation/selection adjustment at the “last mile” and uses existing engine behavior unchanged.
- Avoids widening engine API or adding overlay semantics to core selection logic.

---

## Open questions / feedback requested (stan-core)

1) Is there any reason to push overlay semantics into the engine instead of composing them in the CLI? If so, what small engine API would be helpful (e.g., a path-filter helper)?
2) Any concerns about reserved denials precedence vs anchor re‑include? We propose: anchors re‑include over repo excludes, but never over reserved denials (`.git`, `.stan/diff`, binaries) — confirm alignment.
3) Any pitfalls with path matching (globbing) you’d like the CLI to avoid or centralize in a shared helper?
4) Do you want a tiny “overlay summary” emitted by the engine (for diagnostics), or is the CLI plan print sufficient?
5) Anything else you’d need in core to keep this robust and portable?

We want a negotiated solution, not marching orders — please suggest adjustments.

---

## Roll‑out sketch (non‑breaking)

1) CLI:
   - Read/write facet.meta.json (durable) and facet.state.json (ephemeral, gitignored).
   - Add `--facets` / `--no-facets` and `-f/-F` (names; arrays; naked forms).
   - Compose overlay and apply ramp‑up safety; print “Facet view” under `--plan`.
2) Core: no change required (unless you want to provide a matcher helper).
3) System prompt: add a concise addendum covering “read overlay files every turn; never carve without anchors; update docs with code changes; treat selection diffs as view expansion.”
4) Iterate with stan-core on any helper needs; then ship CLI, and we’ll converge on docs and usage.

---

## Why this will work in practice

- Keeps baselines small in ongoing threads with minimal extra configuration.
- Preserves a complete baseline path for new threads or big pivots.
- Lets the assistant manage facets organically (add anchors; flip booleans), entirely via normal patches — auditable and reversible.
- Requires no new engine semantics; CLI remains the overlay owner and can be improved independently.

Thanks in advance for the feedback. We’ll adjust based on your guidance before implementing.
