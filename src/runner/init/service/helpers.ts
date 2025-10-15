/* src/stan/init/service/helpers.ts
 * Small helpers shared across init service modules.
 */

export const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object';

export const hasOwn = (o: Record<string, unknown>, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

/** Ensure a namespaced node exists on base and return it (preserves insertion order best‑effort). */
export const ensureNsNode = (
  base: Record<string, unknown>,
  key: 'stan-core' | 'stan-cli',
): Record<string, unknown> => {
  if (!isObj(base[key])) base[key] = {};
  return base[key] as Record<string, unknown>;
};

/** Ensure key exists without reordering existing keys. */
export const ensureKey = <T>(
  obj: Record<string, unknown>,
  key: string,
  value: T,
): void => {
  if (!Object.prototype.hasOwnProperty.call(obj, key))
    obj[key] = value as unknown;
};

/** Set key value without changing object key order. */
export const setKey = <T>(
  obj: Record<string, unknown>,
  key: string,
  value: T,
): void => {
  obj[key] = value as unknown;
};
