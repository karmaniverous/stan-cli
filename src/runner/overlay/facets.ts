// src/runner/overlay/facets.ts
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type FacetMeta = Record<
  string,
  {
    exclude?: string[];
    include?: string[];
  }
>;

export type FacetState = Record<string, boolean>;

export type FacetOverlayInput = {
  cwd: string;
  stanPath: string;
  /** Final overlay enabled toggle (defaults handled by caller via cliDefaults/flags). */
  enabled: boolean;
  /** Facet names explicitly activated for this run (flags). */
  activate?: string[];
  /** Facet names explicitly deactivated for this run (flags). */
  deactivate?: string[];
  /** Naked -f: treat all facets as active (overlay ON, no hiding). */
  nakedActivateAll?: boolean;
};

export type FacetOverlayOutput = {
  enabled: boolean;
  excludesOverlay: string[];
  anchorsOverlay: string[];
  /** Final effective ON/OFF per facet name for this run (after overrides and safety). */
  effective: Record<string, boolean>;
  /** Facets auto-suspended due to missing anchors under their excluded roots. */
  autosuspended: string[];
  /** Count of anchors kept per facet (for plan/metadata summaries). */
  anchorsKeptCounts: Record<string, number>;
  /** Per-facet count of inactive subtree roots retained after enabled-wins filtering (diagnostics). */
  overlapKeptCounts: Record<string, number>;
};

const posix = (p: string): string =>
  p.replace(/\\+/g, '/').replace(/^\.\/+/, '');
const toAbs = (cwd: string, rel: string): string => path.join(cwd, rel);

const safeReadJson = async <T>(abs: string): Promise<T | null> => {
  try {
    const raw = await readFile(abs, 'utf8');
    const v = JSON.parse(raw) as unknown;
    return (v && typeof v === 'object' ? (v as T) : null) ?? null;
  } catch {
    return null;
  }
};

const stripGlobTail = (s: string): string => {
  // Normalize common subtree globs; keep simple semantics for ramp-up safety roots.
  let out = s.trim();
  if (out.endsWith('/**')) out = out.slice(0, -3);
  if (out.endsWith('/*')) out = out.slice(0, -2);
  return posix(out).replace(/\/+$/, ''); // drop trailing slash
};
/** Return true if a pattern looks like a subtree pattern (ends with '/**' or '/*'). */
const isSubtreePattern = (s: string): boolean => {
  const p = posix(s.trim());
  return p.endsWith('/**') || p.endsWith('/*');
};
/** Extract the "tail" (after last '/') from a glob (e.g., '**\/*.test.ts' -\> '*.test.ts'). */
const globTail = (s: string): string => {
  const p = posix(s.trim());
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
};
/** Normalize subtree roots from a list of exclude patterns. */
const collectSubtreeRoots = (patterns: string[] | undefined): string[] =>
  (patterns ?? [])
    .filter((p) => isSubtreePattern(p))
    .map(stripGlobTail)
    .filter((r) => r.length > 0);

/** Collect leaf‑glob tails (e.g., '**\/*.test.ts' -\> '*.test.ts') from a list of exclude patterns. */
const collectLeafGlobTails = (patterns: string[] | undefined): string[] =>
  (patterns ?? [])
    .filter((p) => !isSubtreePattern(p))
    .map(globTail)
    .filter((t) => t.length > 0);

const isUnder = (childRel: string, root: string): boolean => {
  const c = posix(childRel);
  const r = posix(root);
  return c === r || c.startsWith(r.length ? r + '/' : '');
};

export const readFacetMeta = async (
  cwd: string,
  stanPath: string,
): Promise<FacetMeta> => {
  const abs = toAbs(cwd, path.join(stanPath, 'system', 'facet.meta.json'));
  const meta = await safeReadJson<FacetMeta>(abs);
  return meta ?? {};
};

export const readFacetState = async (
  cwd: string,
  stanPath: string,
): Promise<FacetState> => {
  const abs = toAbs(cwd, path.join(stanPath, 'system', 'facet.state.json'));
  const st = await safeReadJson<FacetState>(abs);
  return st ?? {};
};

/**
 * Compute the effective overlay (excludes + anchors) for this run.
 * - Per-run overrides take precedence over state; missing facets default active.
 * - Naked -f sets overlay ON with all facets active (no hiding).
 * - Ramp-up safety: if an inactive facet has no anchor present under any of its
 *   excluded subtree roots, aut0-suspend the drop (treat as active) and report it.
 */
export const computeFacetOverlay = async (
  input: FacetOverlayInput,
): Promise<FacetOverlayOutput> => {
  const { cwd, stanPath } = input;
  const meta = await readFacetMeta(cwd, stanPath);
  const state = await readFacetState(cwd, stanPath);
  const facetNames = Object.keys(meta);
  const explicitOff = new Set<string>(
    Array.isArray(input.deactivate)
      ? input.deactivate.filter((s): s is string => typeof s === 'string')
      : [],
  );

  // Narrow a facet definition object safely (avoid optional-chaining on meta[name]).
  const defOf = (name: string): { exclude?: string[]; include?: string[] } => {
    const raw = (meta as Record<string, unknown>)[name];
    return raw && typeof raw === 'object'
      ? (raw as { exclude?: string[]; include?: string[] })
      : {};
  };

  // Base effective map from state (missing facets => active by default).
  const effective: Record<string, boolean> = {};
  for (const name of facetNames) {
    effective[name] = typeof state[name] === 'boolean' ? state[name] : true;
  }

  // Apply per-run overrides
  if (Array.isArray(input.activate)) {
    for (const n of input.activate) effective[n] = true;
  }
  if (Array.isArray(input.deactivate)) {
    for (const n of input.deactivate) effective[n] = false;
  }
  if (input.nakedActivateAll) {
    for (const n of facetNames) effective[n] = true;
  }

  const anchorsOverlaySet = new Set<string>();
  // Final excludes overlay entries (subtree roots only; leaf-globs are not propagated here).
  const excludesOverlayArr: string[] = [];
  // Track subtree-root entries for enabled-wins filtering.
  const excludesOverlayRoots: string[] = [];
  const autosuspended: string[] = [];
  const anchorsKeptCounts: Record<string, number> = {};
  // Track per-facet inactive subtree roots for overlap-kept diagnostics.
  const inactiveEntries: Array<{ facet: string; root: string }> = [];
  // Collect leaf‑glob tails from active facets (protected patterns).
  const activeLeafTails = new Set<string>();

  // Precompute active subtree roots across all facets (for tie-breakers and scoped anchors).
  const activeRoots = new Set<string>();
  for (const name of facetNames) {
    const isActive = effective[name];
    const exRoots = collectSubtreeRoots(meta[name].exclude);
    if (isActive) for (const r of exRoots) activeRoots.add(posix(r));
    // Also collect leaf‑glob tails for active facets so they can be protected
    // under inactive subtree roots (enabled‑wins across leaf‑glob vs subtree).
    if (isActive) {
      for (const tail of collectLeafGlobTails(meta[name].exclude))
        activeLeafTails.add(tail);
    }
  }
  // Collect leaf-glob tails from inactive facets (for scoped anchors under active roots).
  const inactiveLeafTails = new Set<string>();

  // Always include all anchors (keep docs breadcrumbs visible even when overlay off)
  for (const name of facetNames) {
    const def = defOf(name);
    const inc = Array.isArray(def.include) ? def.include.map(posix) : [];
    anchorsKeptCounts[name] = 0;
    for (const a of inc) {
      anchorsOverlaySet.add(a);
    }
  }

  // Always anchor the facet state file so it is included in full archives
  // regardless of .gitignore entries or overlay state. This allows the
  // assistant and tooling to reason about the next-run facet defaults.
  // Note: anchors honor reserved denials in the engine; this path is safe.
  try {
    const facetState = posix(path.join(stanPath, 'system', 'facet.state.json'));
    anchorsOverlaySet.add(facetState);
  } catch {
    /* best-effort */
  }
  // Also anchor docs metadata so assistants can see prompt/overlay baselines.
  // This file is gitignored but safe to include (subject to reserved denials).
  try {
    const docsMeta = posix(path.join(stanPath, 'system', '.docs.meta.json'));
    anchorsOverlaySet.add(docsMeta);
  } catch {
    /* best-effort */
  }

  // If overlay disabled, do not add any excludes, but still report anchorsKept counts.
  if (!input.enabled) {
    // Count anchors that exist physically for metadata
    for (const name of facetNames) {
      const def = defOf(name);
      const inc = Array.isArray(def.include) ? def.include.map(posix) : [];
      anchorsKeptCounts[name] = inc.filter((a) =>
        existsSync(toAbs(cwd, a)),
      ).length;
    }
    return {
      enabled: false,
      excludesOverlay: [],
      anchorsOverlay: Array.from(anchorsOverlaySet),
      effective,
      autosuspended,
      anchorsKeptCounts,
      overlapKeptCounts: {},
    };
  }

  // Ramp-up safety + excludes aggregation
  for (const name of facetNames) {
    const isActive = effective[name];
    const def = defOf(name);
    const excludes = Array.isArray(def.exclude) ? def.exclude.map(posix) : [];
    const exRoots = excludes
      .filter(isSubtreePattern)
      .map(stripGlobTail)
      .filter(Boolean);
    const leafGlobs = excludes.filter((p) => !isSubtreePattern(p));
    const inc = Array.isArray(def.include) ? def.include.map(posix) : [];

    // Count anchors present on disk (for metadata)
    anchorsKeptCounts[name] = inc.filter((a) =>
      existsSync(toAbs(cwd, a)),
    ).length;

    if (isActive) {
      continue; // no drop for this facet
    }

    // Check if any include anchor exists under an excluded subtree root (ramp-up guard).
    // Only subtree roots participate in ramp-up safety; leaf globs are ignored here.
    const hasRoots = exRoots.length > 0;
    const hasAnchorUnderRoot =
      hasRoots &&
      inc.length > 0 &&
      exRoots.some((root) =>
        inc.some((a) => isUnder(a, root) && existsSync(toAbs(cwd, a))),
      );

    if (hasRoots && !hasAnchorUnderRoot) {
      // Option Y: explicit per-run deactivation wins.
      // Only auto-suspend when the facet is inactive due to default/state (not an explicit --facets-off).
      if (!explicitOff.has(name)) {
        effective[name] = true;
        autosuspended.push(name);
        continue;
      }
    }

    // Aggregate subtree excludes for truly inactive facets with anchors present under roots (if any).
    for (const rootRaw of exRoots) {
      const root = posix(rootRaw);
      if (!root) continue;
      inactiveEntries.push({ facet: name, root });
      excludesOverlayRoots.push(root.endsWith('/') ? root : root);
    }
    // Collect leaf-glob tails for scoped re-inclusions under active roots.
    for (const g of leafGlobs) {
      const tail = globTail(g);
      if (tail) inactiveLeafTails.add(tail);
    }
  }

  // Subtree tie-breaker: enabled facet wins (drop inactive roots that equal/overlap with active roots).
  const overlapKeptCounts: Record<string, number> = {};
  if (inactiveEntries.length > 0 && activeRoots.size > 0) {
    const act = Array.from(activeRoots);
    const keptRoots: string[] = [];
    const keptEntries: Array<{ facet: string; root: string }> = [];
    for (const entry of inactiveEntries) {
      const r = entry.root;
      const drop = act.some(
        (ar) => ar === r || isUnder(r, ar) || isUnder(ar, r),
      );
      if (!drop) {
        keptRoots.push(r);
        keptEntries.push(entry);
      }
    }
    // Replace with filtered roots only.
    excludesOverlayArr.length = 0;
    excludesOverlayArr.push(...keptRoots);
    // Count kept roots per facet
    for (const { facet } of keptEntries) {
      overlapKeptCounts[facet] = (overlapKeptCounts[facet] ?? 0) + 1;
    }
  } else {
    // No filtering occurred (no active roots or no excludes); consider all inactive entries as kept.
    for (const { facet } of inactiveEntries) {
      overlapKeptCounts[facet] = (overlapKeptCounts[facet] ?? 0) + 1;
    }
    // Append the raw subtree roots only.
    const uniq = Array.from(new Set(excludesOverlayRoots));
    excludesOverlayArr.length = 0;
    excludesOverlayArr.push(...uniq);
  }

  // Enabled‑wins for leaf‑glob patterns: protect ACTIVE facets' leaf‑glob tails
  // under any remaining inactive subtree roots by adding scoped anchors
  // "<inactiveRoot>/**/<tail>" so those files remain visible.
  if (activeLeafTails.size > 0 && excludesOverlayArr.length > 0) {
    try {
      for (const root of excludesOverlayArr) {
        for (const tail of activeLeafTails) {
          const scoped = posix(`${root}/**/${tail}`);
          anchorsOverlaySet.add(scoped);
        }
      }
    } catch {
      /* best-effort */
    }
  }

  // Leaf-glob scoped re-inclusion: add anchors "<activeRoot>/**/<tail>" for every collected tail.
  if (inactiveLeafTails.size > 0 && activeRoots.size > 0) {
    for (const ar of activeRoots) {
      for (const tail of inactiveLeafTails) {
        const scoped = posix(`${ar}/**/${tail}`);
        anchorsOverlaySet.add(scoped);
      }
    }
  }

  // Deduplicate anchors overlay
  const anchorsOverlay = Array.from(anchorsOverlaySet);
  // Excludes overlay contains subtree roots only (already deduped above).

  return {
    enabled: true,
    excludesOverlay: excludesOverlayArr,
    anchorsOverlay,
    effective,
    autosuspended,
    anchorsKeptCounts,
    overlapKeptCounts,
  };
};
