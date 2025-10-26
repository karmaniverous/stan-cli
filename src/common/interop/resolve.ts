// src/common/interop/resolve.ts
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
