import type { Command } from 'commander';

/** Safe wrapper for Commander’s getOptionValueSource (avoid unbound method usage). */
export const getOptionSource = (
  cmd: Command,
  name: string,
): string | undefined => {
  try {
    const holder = cmd as unknown as {
      getOptionValueSource?: (n: string) => string | undefined;
    };
    const fn = holder.getOptionValueSource;
    return typeof fn === 'function' ? fn.call(cmd, name) : undefined;
  } catch {
    return undefined;
  }
};

/** Coerce nested unknown to a string list (preserving order; dropping non-strings). */
export const toStringArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : typeof v === 'string'
      ? [v]
      : [];
