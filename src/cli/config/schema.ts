/* src/cli/config/schema.ts
 * Zod schemas and helpers for stan-cli configuration (top-level "stan-cli").
 */
import { z } from 'zod';

const isValidRegex = (s: string): boolean => {
  try {
    // Construct without flags; pattern may include inline flags if desired.
    new RegExp(s);
    return true;
  } catch {
    return false;
  }
};

const isValidFlags = (s: string): boolean => {
  try {
    // Validate via constructor; throws on invalid/duplicate flags.
    // Node 20 supports g i m s u y d
    // We let the engine/runtime enforce exact support; constructor check is sufficient.
    // Using empty pattern is fine for validating flags.

    new RegExp('', s);
    return true;
  } catch {
    return false;
  }
};

// Common coercer for boolean-ish values
const coerceBool = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    const s = String(v).trim().toLowerCase();
    if (s === '1' || s === 'true') return true;
    if (s === '0' || s === 'false') return false;
    return undefined;
  })
  .optional();

export type ScriptEntry =
  | string
  | {
      script: string;
      warnPattern?: string;
      /** Optional regex flags that override the default flags behavior for warnPattern. */
      warnPatternFlags?: string;
    };
export type ScriptMap = Record<string, ScriptEntry>;

const scriptObjectSchema = z
  .object({
    script: z.string().min(1, { message: 'script must be a non-empty string' }),
    warnPattern: z
      .string()
      .min(1, { message: 'warnPattern must be a non-empty string' })
      .optional()
      .refine((v) => (typeof v === 'string' ? isValidRegex(v) : true), {
        message: 'warnPattern: invalid regular expression',
      }),
    warnPatternFlags: z
      .string()
      .optional()
      .refine((v) => (typeof v === 'string' ? isValidFlags(v) : true), {
        message: 'warnPatternFlags: invalid regex flags',
      }),
  })
  .strict();

export const scriptsSchema = z
  .record(z.string(), z.union([z.string().min(1), scriptObjectSchema]))
  .default({});
export type Scripts = z.infer<typeof scriptsSchema>;

const cliDefaultsRunSchema = z
  .object({
    archive: coerceBool,
    combine: coerceBool,
    keep: coerceBool,
    sequential: coerceBool,
    live: coerceBool,
    plan: coerceBool,
    facets: coerceBool,
    hangWarn: z.coerce.number().int().positive().optional(),
    hangKill: z.coerce.number().int().positive().optional(),
    hangKillGrace: z.coerce.number().int().positive().optional(),
    scripts: z.union([z.boolean(), z.array(z.string())]).optional(),
    prompt: z.string().optional(),
  })
  .strict()
  .optional();

const cliDefaultsPatchSchema = z
  .object({ file: z.string().optional() })
  .strict()
  .optional();

const cliDefaultsSnapSchema = z
  .object({ stash: coerceBool })
  .strict()
  .optional();

export const cliDefaultsSchema = z
  .object({
    debug: coerceBool,
    boring: coerceBool,
    patch: cliDefaultsPatchSchema,
    run: cliDefaultsRunSchema,
    snap: cliDefaultsSnapSchema,
  })
  .strict()
  .optional();
export type CliDefaults = z.infer<typeof cliDefaultsSchema>;

// Complete CLI config block (namespaced under stan-cli)
export const cliConfigSchema = z
  .object({
    scripts: scriptsSchema,
    cliDefaults: cliDefaultsSchema,
    patchOpenCommand: z.string().optional(),
    maxUndos: z.coerce.number().int().positive().optional(),
    devMode: coerceBool,
  })
  .strict();
export type CliConfig = z.infer<typeof cliConfigSchema>;

// Guard: disallow dangerous reserved script names
export const ensureNoReservedScriptKeys = (
  scripts: Record<string, unknown>,
): void => {
  const bad = ['archive', 'init'].filter((k) =>
    Object.prototype.hasOwnProperty.call(scripts ?? {}, k),
  );
  if (bad.length > 0)
    throw new Error(`scripts: keys "archive" and "init" not allowed`);
};
