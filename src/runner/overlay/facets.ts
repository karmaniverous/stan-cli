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
    };
  }

  // Ramp-up safety + excludes aggregation
  for (const name of facetNames) {
    const isActive = effective[name] !== false;
    const exRoots = (meta[name]?.exclude ?? [])
      .map(stripGlobTail)
      .filter(Boolean);
    const inc = (meta[name]?.include ?? []).map(posix);

    // Count anchors present on disk (for metadata)
    anchorsKeptCounts[name] = inc.filter((a) =>
      existsSync(toAbs(cwd, a)),
    ).length;

    if (isActive) {
      continue; // no drop for this facet
    }

    // Check if any include anchor exists under an excluded root
    const hasAnchorUnderRoot =
      inc.length > 0 &&
      exRoots.some((root) =>
        inc.some((a) => isUnder(a, root) && existsSync(toAbs(cwd, a))),
      );

    if (!hasAnchorUnderRoot) {
      // Auto-suspend this facet's drop for this run
      effective[name] = true;
      autosuspended.push(name);
      continue;
    }

    // Aggregate excludes for truly inactive facets with anchors present
    for (const root of exRoots) {
      if (root) excludesOverlayArr.push(root.endsWith('/') ? root : root);
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
  };
};
