/**
 * Resolve callable exports from ESM modules under SSR/bundler/mock variance.
 * Prefers named exports but can tolerate `default.<name>` and other common
 * interop shapes when explicitly enabled by options.
 * @module
 */

/**
 * Resolve a function export from a module, preferring a named export and
 * falling back to an identically named property on the module's default export.
 *
 * This helper avoids the use of `any`; callers provide the function type `F`
 * and the pickers that extract the candidate from the module shape (typed or unknown).
 *
 * @typeParam F - Function type to resolve (e.g., typeof import('./mod')['foo']).
 * @param mod - The imported module object (typed or unknown).
 * @param pickNamed - Extractor for the named export (returns undefined when absent).
 * @param pickDefault - Extractor for the default export's property (returns undefined when absent).
 * @param label - Optional label for error messaging.
 * @returns The resolved function of type F.
 * @throws When neither the named nor the default export provides the function.
 */
export function resolveNamedOrDefaultFunction<F>(
  mod: unknown,
  pickNamed: (m: unknown) => F | undefined,
  pickDefault: (m: unknown) => F | undefined,
  label?: string,
): F {
  try {
    const named = pickNamed(mod);
    if (typeof named === 'function') return named;
  } catch {
    /* ignore pickNamed errors */
  }
  try {
    const viaDefault = pickDefault(mod);
    if (typeof viaDefault === 'function') return viaDefault;
  } catch {
    /* ignore pickDefault errors */
  }
  const what = label && label.trim().length ? label.trim() : 'export';
  throw new Error(`resolveNamedOrDefaultFunction: ${what} not found`);
}

export type ResolveCallableExportOptions = {
  /**
   * When true, allow `module.default` itself to be callable and return it as a
   * fallback when the named property cannot be found.
   */
  allowDefaultCallable?: boolean;
  /**
   * When true, allow the module object itself to be callable (module-as-function
   * mocks) and return it as a fallback when the named property cannot be found.
   */
  allowModuleCallable?: boolean;
  /**
   * When true, scan the immediate `default` export object for any callable value
   * (last-resort compatibility for unusual mock shapes).
   */
  scanDefaultObject?: boolean;
  /**
   * How many times to follow nested `default.default...` chains while searching
   * for `<name>` (or a callable default when enabled).
   */
  maxDefaultDepth?: number;
};

const getProp = (obj: unknown, key: string): unknown => {
  try {
    if (obj === null || typeof obj === 'undefined') return undefined;
    return (obj as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
};

const isCallable = (v: unknown): v is (...args: unknown[]) => unknown =>
  typeof v === 'function';

/**
 * Resolve a callable export from a module with robust fallbacks.
 *
 * Resolution order:
 * - named export: `mod[name]`
 * - default property: `mod.default?.[name]`
 * - callable default (optional): `mod.default`
 * - callable module (optional): `mod`
 * - nested default chain: `mod.default.default...` (bounded)
 * - scan immediate default object for any callable (optional)
 *
 * @typeParam F - The expected callable type (function or constructor).
 * @param mod - Imported module object (typed or unknown).
 * @param name - Export name to resolve.
 * @param opts - Fallback behaviors (all disabled by default except depth=3).
 * @returns The resolved callable.
 * @throws When no callable candidate can be found.
 */

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function resolveCallableExport<F>(
  mod: unknown,
  name: string,
  opts?: ResolveCallableExportOptions,
): F {
  const maxDefaultDepth =
    typeof opts?.maxDefaultDepth === 'number' && opts.maxDefaultDepth >= 0
      ? opts.maxDefaultDepth
      : 3;
  const allowDefaultCallable = opts?.allowDefaultCallable === true;
  const allowModuleCallable = opts?.allowModuleCallable === true;
  const scanDefaultObject = opts?.scanDefaultObject === true;

  const candidates: Array<(...args: unknown[]) => unknown> = [];
  const seenFns = new Set<unknown>();
  const push = (v: unknown): void => {
    if (!isCallable(v)) return;
    if (seenFns.has(v)) return;
    seenFns.add(v);
    candidates.push(v);
  };

  // Named export: mod[name]
  push(getProp(mod, name));

  // default.<name>
  const topDefault = getProp(mod, 'default');
  push(getProp(topDefault, name));

  // default as callable (optional)
  if (allowDefaultCallable) push(topDefault);

  // module as callable (optional)
  if (allowModuleCallable) push(mod);

  // Walk nested defaults (bounded, cycle-safe)
  const seenObjs = new Set<unknown>();
  let cur: unknown = topDefault;
  for (let i = 0; i < maxDefaultDepth; i += 1) {
    if (!cur || seenObjs.has(cur)) break;
    seenObjs.add(cur);
    const next = getProp(cur, 'default');
    push(getProp(next, name));
    if (allowDefaultCallable) push(next);
    cur = next;
  }

  // Scan immediate default object for any callable property (last resort)
  if (scanDefaultObject && topDefault && typeof topDefault === 'object') {
    try {
      for (const v of Object.values(topDefault as Record<string, unknown>)) {
        push(v);
      }
    } catch {
      /* ignore */
    }
  }

  if (candidates.length > 0) return candidates[0] as unknown as F;

  const lbl = name.trim().length ? name.trim() : '(unnamed)';
  throw new Error(`resolveCallableExport: ${lbl} not found`);
}

/**
 * Non-throwing variant of {@link resolveCallableExport}.
 *
 * @typeParam F - The expected callable type (function or constructor).
 * @param mod - Imported module object (typed or unknown).
 * @param name - Export name to resolve.
 * @param opts - Fallback behaviors.
 * @returns The resolved callable, or `null` when not found.
 */
export // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function tryResolveCallableExport<F>(
  mod: unknown,
  name: string,
  opts?: ResolveCallableExportOptions,
): F | null {
  try {
    return resolveCallableExport<F>(mod, name, opts);
  } catch {
    return null;
  }
}
