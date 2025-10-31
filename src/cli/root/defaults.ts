// src/cli/root/defaults.ts
import { pickCliNode, readRawConfigSync } from '@/cli/config/raw';

/** Read root debug/boring/yes defaults synchronously with a permissive legacy fallback. */
export const readRootDefaultsFromConfig = (
  dir: string,
): {
  debugDefault: boolean;
  boringDefault: boolean;
  yesDefault: boolean;
} | null => {
  try {
    const root = readRawConfigSync(dir);
    const cliNs = pickCliNode(root);

    const toBool = (v: unknown): boolean => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v === 1;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === '1' || s === 'true';
      }
      return false;
    };
    const pick = (node: Record<string, unknown> | null | undefined) => {
      const d = node && typeof node === 'object' ? node : {};
      const def =
        d['cliDefaults'] && typeof d['cliDefaults'] === 'object'
          ? (d['cliDefaults'] as Record<string, unknown>)
          : {};
      const debugDefault = toBool((def as { debug?: unknown }).debug);
      const boringDefault = toBool((def as { boring?: unknown }).boring);
      // transitional (not canonical): accept "yes" when present
      const yesDefault = toBool((def as { yes?: unknown }).yes);
      return { debugDefault, boringDefault, yesDefault };
    };
    if (cliNs) return pick(cliNs);
    return pick(root);
  } catch {
    return null;
  }
};
