/* src/cli/stan/run-args.ts
 * Pure derivation of run invocation parameters from flags (no Commander internals).
 *
 * NEW SELECTION MODEL:
 * - -s, --scripts [keys...]: optional variadic.
 *   - if provided with keys: select those keys (filtered/deduped to known).
 *   - if provided with no keys: select all known scripts.
 *   - if NOT provided: initial selection is [] (no scripts).
 * - -x, --except-scripts <keys...>: variadic, requires at least one key.
 *   - if -s is provided: reduce the -s selection by these keys.
 *   - if -s is NOT provided: reduce from the full set of known keys (all minus except).
 * - If neither -s nor -x is provided, selection is [] (runner enforces “one of -a/-s/-x required”).
 *
 * Mode:
 * - -q, --sequential -> 'sequential'; otherwise 'concurrent'.
 *
 * Behavior:
 * - combine, keep, archive are mapped directly to booleans; runner validates constraints.
 */

import type { ExecutionMode, RunBehavior } from '@/runner/run';

const stringsFrom = (v: unknown): string[] => {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'string') {
      out.push(x);
    } else if (Array.isArray(x)) {
      for (const el of x) walk(el);
    }
  };
  walk(v);
  return out;
};

const dedupePreserve = (list: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of list) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
};

export type DerivedRunInvocation = {
  selection: string[]; // explicit list (empty allowed)
  mode: ExecutionMode;
  behavior: RunBehavior;
};

export function deriveRunInvocation(args: {
  // selection flags (presence and payload)
  scriptsProvided?: boolean;
  scriptsOpt?: unknown;
  exceptProvided?: boolean;
  exceptOpt?: unknown;

  // other flags
  sequential?: unknown; // -q
  combine?: unknown;
  keep?: unknown;
  archive?: unknown;

  // config (CLI-owned scripts only)
  config: { scripts?: Record<string, unknown> };
}): DerivedRunInvocation {
  const {
    scriptsProvided = false,
    scriptsOpt,
    exceptProvided = false,
    exceptOpt,
    sequential,
    combine,
    keep,
    archive,
    config,
  } = args;

  const allKeys = Object.keys(config?.scripts ?? {});
  const known = new Set(allKeys);

  const scriptsList = dedupePreserve(
    stringsFrom(scriptsOpt).filter((k) => known.has(k)),
  );
  const exceptList = dedupePreserve(
    stringsFrom(exceptOpt).filter((k) => known.has(k)),
  );

  // Base selection from -s
  let selected: string[] = [];
  if (scriptsProvided) {
    selected = scriptsList.length > 0 ? scriptsList : [...allKeys];
  } else {
    selected = [];
  }

  // Apply -x
  if (exceptProvided) {
    const exSet = new Set(exceptList);
    if (scriptsProvided) {
      selected = selected.filter((k) => !exSet.has(k));
    } else {
      // reduce from full set when -s absent
      selected = allKeys.filter((k) => !exSet.has(k));
    }
  }

  const mode: ExecutionMode = sequential ? 'sequential' : 'concurrent';

  const behavior: RunBehavior = {
    combine: Boolean(combine),
    keep: Boolean(keep),
    archive: Boolean(archive),
  };

  return { selection: selected, mode, behavior };
}
