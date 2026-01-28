/**
 * Filter a dependency map down to the computed allowlist plan.
 *
 * This is a CLI-side hardening step for context mode: if downstream staging
 * internals mistakenly stage “everything in the map” (graph-unconditional),
 * filtering the map ensures only state-selected externals can be staged.
 * @module
 */

const toPosix = (p: string): string => p.replace(/\\+/g, '/');

/**
 * Return a shallow copy of the dependency map containing only entries whose
 * keys are present in the allowlist.
 *
 * @typeParam V - Dependency-map entry value type.
 * @param map - Full dependency map (nodeId -> entry).
 * @param allowlist - Allowlist plan entries (repo-relative POSIX paths).
 * @returns Filtered dependency map containing only allowlisted entries.
 */
export const filterDependencyMapToAllowlist = <V>(
  map: Record<string, V>,
  allowlist: string[],
): Record<string, V> => {
  const allow = new Set(allowlist.map(toPosix));
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(map)) {
    if (allow.has(toPosix(k))) out[k] = v;
  }
  return out;
};
