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
  const excludesOverlayArr: string[] = [];
  const autosuspended: string[] = [];
  const anchorsKeptCounts: Record<string, number> = {};
  // Track per-facet inactive subtree roots for overlap-kept diagnostics.
  const inactiveEntries: Array<{ facet: string; root: string }> = [];

  // Precompute active subtree roots across all facets (for tie-breakers and scoped anchors).
  const activeRoots = new Set<string>();
  for (const name of facetNames) {
    const isActive = effective[name] !== false;
    const exRoots = collectSubtreeRoots(meta[name]?.exclude);
    if (isActive) for (const r of exRoots) activeRoots.add(posix(r));
  }
  // Collect leaf-glob tails from inactive facets (for scoped anchors under active roots).
  const inactiveLeafTails = new Set<string>();

  // Always include all anchors (keep docs breadcrumbs visible even when overlay off)
  for (const name of facetNames) {
    const inc = (meta[name]?.include ?? []).map(posix);
    anchorsKeptCounts[name] = 0;
    for (const a of inc) {
      anchorsOverlaySet.add(a);
    }
  }

  // If overlay disabled, do not add any excludes, but still report anchorsKept counts.
  if (!input.enabled) {
    // Count anchors that exist physically for metadata
    for (const name of facetNames) {
      const inc = (meta[name]?.include ?? []).map(posix);
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
    const isActive = effective[name] !== false;
    const excludes = (meta[name]?.exclude ?? []).map(posix);
    const exRoots = excludes
      .filter(isSubtreePattern)
      .map(stripGlobTail)
      .filter(Boolean);
    const leafGlobs = excludes.filter((p) => !isSubtreePattern(p));
    const inc = (meta[name]?.include ?? []).map(posix);

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
      // Auto-suspend this facet's drop for this run
      effective[name] = true;
      autosuspended.push(name);
      continue;
    }

    // Aggregate subtree excludes for truly inactive facets with anchors present under roots (if any).
    for (const rootRaw of exRoots) {
      const root = posix(rootRaw);
      if (!root) continue;
      inactiveEntries.push({ facet: name, root });
      excludesOverlayArr.push(root.endsWith('/') ? root : root);
    }
    // Collect leaf-glob tails to re-include within each active root.
    for (const g of leafGlobs) {
      const tail = globTail(g);
      if (tail) inactiveLeafTails.add(tail);
    }
  }

  // Subtree tie-breaker: enabled facet wins (drop inactive roots that equal/overlap with active roots).
  const overlapKeptCounts: Record<string, number> = {};
  if (excludesOverlayArr.length > 0 && activeRoots.size > 0) {
    const act = Array.from(activeRoots);
    const kept: string[] = [];
    const keptEntries: Array<{ facet: string; root: string }> = [];
    for (const entry of inactiveEntries) {
      const r = entry.root;
      const drop = act.some(
        (ar) => ar === r || isUnder(r, ar) || isUnder(ar, r),
      );
      if (!drop) {
        kept.push(r);
        keptEntries.push(entry);
      }
    }
    // Replace with filtered list
    excludesOverlayArr.length = 0;
    excludesOverlayArr.push(...kept);
    // Count kept roots per facet
    for (const { facet } of keptEntries) {
      overlapKeptCounts[facet] = (overlapKeptCounts[facet] ?? 0) + 1;
    }
  } else {
    // No filtering occurred (no active roots or no excludes); consider all inactive entries as kept.
    for (const { facet } of inactiveEntries) {
      overlapKeptCounts[facet] = (overlapKeptCounts[facet] ?? 0) + 1;
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
