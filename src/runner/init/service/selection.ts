/* src/stan/init/service/selection.ts
 * Compute includes/excludes from namespaced engine node; fall back to root.
 */
import { isObj } from './helpers';

export const resolveIncludesExcludes = (
  base: Record<string, unknown>,
): { includes: string[]; excludes: string[] } => {
  const core = (base['stan-core'] ?? {}) as Record<string, unknown>;
  if (isObj(core)) {
    const inc = Array.isArray((core as { includes?: unknown }).includes)
      ? ((core as { includes?: string[] }).includes ?? [])
      : [];
    const exc = Array.isArray((core as { excludes?: unknown }).excludes)
      ? ((core as { excludes?: string[] }).excludes ?? [])
      : [];
    return { includes: inc, excludes: exc };
  }
  return {
    includes: (base as { includes?: string[] }).includes ?? [],
    excludes: (base as { excludes?: string[] }).excludes ?? [],
  };
};
