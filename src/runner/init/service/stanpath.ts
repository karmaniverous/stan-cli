/* src/stan/init/service/stanpath.ts
 * Resolve effective stanPath from config (prefer stan-core).
 */
import { isObj } from './helpers';

export const resolveEffectiveStanPath = (
  base: Record<string, unknown>,
  defaultStanPath: string,
): string => {
  const core = (base['stan-core'] ?? {}) as Record<string, unknown>;
  const fromCore =
    isObj(core) && typeof (core as { stanPath?: unknown }).stanPath === 'string'
      ? String((core as { stanPath: string }).stanPath).trim()
      : '';
  if (fromCore) return fromCore;
  const fromRoot =
    typeof (base as { stanPath?: unknown }).stanPath === 'string'
      ? String((base as { stanPath: string }).stanPath).trim()
      : '';
  return fromRoot || defaultStanPath;
};
