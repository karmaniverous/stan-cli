import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  computeFacetOverlay,
  type FacetOverlayOutput,
} from '@/runner/overlay/facets';

const hasGlob = (s: string): boolean =>
  s.includes('*') || s.includes('?') || s.includes('[');
const ensureSubtreeGlob = (p: string): string => {
  const s = p.replace(/\/+$/, '');
  return hasGlob(s) ? s : `${s}/**`;
};
const toPosix = (p: string): string => p.replace(/\\+/g, '/');

export const buildOverlayInputs = async (args: {
  cwd: string;
  stanPath: string;
  enabled: boolean;
  activateNames: string[];
  deactivateNames: string[];
  nakedActivateAll: boolean;
}): Promise<{
  overlay: FacetOverlayOutput | null;
  engineExcludes: string[];
  overlayPlan?: string[];
}> => {
  const { cwd, stanPath, enabled, activateNames, deactivateNames } = args;
  // Compute overlay for plan + engine inputs
  let overlay: FacetOverlayOutput | null = null;
  try {
    overlay = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled,
      activate: activateNames.length ? activateNames : undefined,
      deactivate: deactivateNames.length ? deactivateNames : undefined,
      nakedActivateAll: args.nakedActivateAll,
    });
  } catch {
    overlay = {
      enabled,
      excludesOverlay: [],
      anchorsOverlay: [],
      effective: {},
      autosuspended: [],
      anchorsKeptCounts: {},
      overlapKeptCounts: {},
    };
  }

  // Decide whether to map excludes even when the global overlay flag is off:
  // - If explicit per‑run overrides (-f/-F names) are provided, we still derive
  //   engine excludes/leaf‑globs so callers can observe the intended mapping.
  const shouldMap =
    enabled ||
    (Array.isArray(args.activateNames) && args.activateNames.length > 0) ||
    (Array.isArray(args.deactivateNames) && args.deactivateNames.length > 0) ||
    args.nakedActivateAll;

  // Map overlay excludes to effective deny-list globs for the engine:
  // - subtree roots like "docs" -> "docs/**"
  // - existing glob patterns (contain *, ?, or [) pass through unchanged.
  const overlayExcludesRaw = shouldMap ? overlay.excludesOverlay : [];
  const overlayExcludes = overlayExcludesRaw.map(ensureSubtreeGlob);

  // Also include leaf-glob excludes from inactive facets (e.g., "**/*.test.ts").
  // Read facet.meta.json directly and derive leaf-globs for facets that are
  // currently inactive per overlay.effective.
  const leafGlobs: string[] = [];
  try {
    if (shouldMap) {
      const metaAbs = path.join(cwd, stanPath, 'system', 'facet.meta.json');
      const raw = await readFile(metaAbs, 'utf8');
      const meta = JSON.parse(raw) as Record<
        string,
        { exclude?: string[] } | undefined
      >;
      const isSubtree = (p: string): boolean => {
        const t = p.trim();
        return t.endsWith('/**') || t.endsWith('/*');
      };
      for (const [name, def] of Object.entries(meta ?? {})) {
        if (!def || !Array.isArray(def.exclude)) continue;
        if (!overlay.effective[name]) {
          for (const patt of def.exclude) {
            if (!isSubtree(patt)) leafGlobs.push(toPosix(patt));
          }
        }
      }
    }
  } catch {
    /* best-effort only */
  }
  const engineExcludes = Array.from(
    new Set<string>([...overlayExcludes, ...leafGlobs]),
  );

  // Facet view lines for plan (same as before; keep compact)
  const overlayPlan = (() => {
    const lines: string[] = [];
    lines.push(`overlay: ${overlay.enabled ? 'on' : 'off'}`);
    if (overlay.enabled) {
      const inactive = Object.entries(overlay.effective)
        .filter(([, v]) => !v)
        .map(([k]) => k);
      const auto = overlay.autosuspended;
      const anchorsTotal = Object.values(overlay.anchorsKeptCounts).reduce(
        (a, b) => a + b,
        0,
      );
      lines.push(
        `facets inactive: ${inactive.length ? inactive.join(', ') : 'none'}`,
      );
      if (auto.length) lines.push(`auto-suspended: ${auto.join(', ')}`);
      lines.push(`anchors kept: ${anchorsTotal.toString()}`);
    }
    return lines;
  })();

  return { overlay, engineExcludes, overlayPlan };
};
