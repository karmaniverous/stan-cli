// src/cli/config/legacy.ts
import { debugFallback } from '@/runner/util/debug';

type Dict = Record<string, unknown>;

const isObj = (v: unknown): v is Dict => v !== null && typeof v === 'object';
const hasOwn = (o: Dict, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

/**
 * Detect whether a parsed config root appears to be legacy (pre‑namespaced)
 * for engine keys: specifically, when top‑level "stan-core" is absent.
 *
 * Note: We intentionally keep this minimal — callers rely on the absence
 * of "stan-core" itself to qualify as "legacy engine" detection. Presence
 * of root‑level engine keys (stanPath/includes/excludes/imports) is common
 * but not required for the notice.
 */
export const detectLegacyRootKeys = (rootUnknown: unknown): boolean => {
  const root = isObj(rootUnknown) ? rootUnknown : {};
  return !hasOwn(root, 'stan-core');
};

/**
 * Emit a concise, scoped debugFallback notice when legacy engine layout is
 * detected (top‑level "stan-core" absent).
 *
 * @param scopeLabel - Debug scope label to preserve test expectations.
 * @param cfgPath - Absolute config path, used for the message.
 * @param rootUnknown - Parsed config root (JSON/YAML → object).
 */
export const maybeDebugLegacy = (
  scopeLabel: string,
  cfgPath: string,
  rootUnknown: unknown,
): void => {
  try {
    if (detectLegacyRootKeys(rootUnknown)) {
      debugFallback(
        scopeLabel,
        `detected legacy root keys (no "stan-core") in ${cfgPath.replace(/\\\\/g, '/')}`,
      );
    }
  } catch {
    /* best‑effort only */
  }
};
