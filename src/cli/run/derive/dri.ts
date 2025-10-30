// src/cli/run/derive/dri.ts
// SSR/mocks‑robust resolution of deriveRunInvocation:
// prefer the named export; fall back to default.deriveRunInvocation; finally a callable default.
import runArgsMod, { deriveRunInvocation as namedDRI } from '../run-args';

export type DeriveRunInvocationFn =
  (typeof import('../run-args'))['deriveRunInvocation'];

/** SSR/mock‑robust resolver for deriveRunInvocation (named → default.property → default as function). */
export const resolveDRI = (): DeriveRunInvocationFn => {
  try {
    if (typeof namedDRI === 'function') return namedDRI;
  } catch {
    /* ignore */
  }
  try {
    const viaProp = (runArgsMod as { deriveRunInvocation?: unknown })
      .deriveRunInvocation;
    if (typeof viaProp === 'function') {
      return viaProp as DeriveRunInvocationFn;
    }
  } catch {
    /* ignore */
  }
  try {
    const defAny = (runArgsMod as { default?: unknown }).default;
    if (typeof defAny === 'function') {
      return defAny as unknown as DeriveRunInvocationFn;
    }
    if (
      defAny &&
      typeof (defAny as { deriveRunInvocation?: unknown })
        .deriveRunInvocation === 'function'
    ) {
      return (defAny as { deriveRunInvocation: DeriveRunInvocationFn })
        .deriveRunInvocation;
    }
  } catch {
    /* ignore */
  }
  throw new Error('deriveRunInvocation not found');
};
