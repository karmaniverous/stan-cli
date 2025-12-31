// src/runner/overlay/facets.ts
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
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

const toSubtreeGlob = (root: string): string => `${posix(root)}/**`;

const segmentUnderRoot = (root: string, p: string): string | null => {
  const r = posix(root);
  const full = posix(p);
  if (!isUnder(full, r)) return null;
  const rest = full.slice(r.length).replace(/^\/+/, '');
  if (!rest.length) return null;
  const first = rest.split('/')[0];
  return first && first.length ? first : null;
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
  const autosuspended: string[] = [];
  const anchorsKeptCounts: Record<string, number> = {};
  // Track per-facet inactive subtree roots for overlap-kept diagnostics.
  const inactiveEntries: Array<{ facet: string; root: string }> = [];

  // Precompute active subtree roots across all facets (for tie-breakers and scoped anchors).
  const activeRoots = new Set<string>();
  for (const name of facetNames) {
    const isActive = effective[name];
    const exRoots = collectSubtreeRoots(meta[name].exclude);
    if (isActive) for (const r of exRoots) activeRoots.add(posix(r));
  }

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
    }
  }

  // Nested structural facets: carve-out inactive roots that contain active descendant roots.
  // - Keep exact-match "enabled wins" behavior (drop inactive root when the same root is active).
  // - If an inactive root contains one or more active descendant subtree roots, exclude all
  //   immediate children under the inactive root that are NOT ancestors of any active root.
  //   This expresses "B on, rest of A off" without using anchors as filter machinery.
  const overlapKeptCounts: Record<string, number> = {};
  const activeRootsArr = Array.from(activeRoots);

  const carveOutOrExcludeRoot = async (root: string): Promise<string[]> => {
    const protectedRoots = activeRootsArr.filter(
      (ar) => ar !== root && isUnder(ar, root),
    );
    if (protectedRoots.length === 0) return [toSubtreeGlob(root)];

    // Compute which immediate child entries are "keepers".
    const keep = new Set<string>();
    for (const pr of protectedRoots) {
      const seg = segmentUnderRoot(root, pr);
      if (seg) keep.add(seg);
    }

    // Enumerate immediate children under the inactive root and exclude everything
    // except the keeper segments. Keep deterministic output ordering.
    const abs = toAbs(cwd, root);
    let dirents: Array<{ name: string; isDirectory: () => boolean }> | null =
      null;
    try {
      dirents = (await readdir(abs, { withFileTypes: true })) as Array<{
        name: string;
        isDirectory: () => boolean;
      }>;
    } catch {
      dirents = null;
    }

    // If we can't enumerate, fall back to excluding the full root and
    // anchor-rescuing the protected roots. This preserves correctness without
    // reintroducing leaf-glob anchor tricks.
    if (!dirents) {
      try {
        for (const pr of protectedRoots)
          anchorsOverlaySet.add(toSubtreeGlob(pr));
      } catch {
        /* best-effort */
      }
      return [toSubtreeGlob(root)];
    }

    const entries = dirents
      .map((d) => ({ name: d.name, isDir: d.isDirectory() }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const out: string[] = [];
    for (const e of entries) {
      if (keep.has(e.name)) continue;
      const rel = posix(path.join(root, e.name));
      out.push(e.isDir ? toSubtreeGlob(rel) : rel);
    }
    return out;
  };

  if (inactiveEntries.length > 0) {
    const patterns = new Set<string>();
    for (const entry of inactiveEntries) {
      const r = entry.root;
      // Enabled-wins (exact match only): if the same subtree root is active, do not apply the inactive drop.
      if (activeRoots.has(r)) continue;
      overlapKeptCounts[entry.facet] =
        (overlapKeptCounts[entry.facet] ?? 0) + 1;
      const ps = await carveOutOrExcludeRoot(r);
      for (const p of ps) patterns.add(posix(p));
    }
    excludesOverlayArr.length = 0;
    excludesOverlayArr.push(
      ...Array.from(patterns).sort((a, b) => a.localeCompare(b)),
    );
  }

  // Deduplicate anchors overlay
  const anchorsOverlay = Array.from(anchorsOverlaySet);
  // Excludes overlay contains engine-ready patterns (subtree globs and/or exact paths).

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
