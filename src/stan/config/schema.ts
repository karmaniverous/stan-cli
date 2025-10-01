/* src/stan/config/schema.ts
 * Strict zod schema for stan.config.* with scripts union and friendly errors.
 */
import { z } from 'zod';

const isValidRegex = (s: string): boolean => {
  try {
    // Construct without flags; pattern may include inline flags if desired.
    // If invalid, this throws a SyntaxError which we catch and convert to false.

    new RegExp(s);
    return true;
  } catch {
    return false;
  }
};

const StrictStringArray = z.array(z.string()).default([]).optional();

const ImportsValue = z.union([z.string(), z.array(z.string())]);
export const ImportsSchema = z.record(ImportsValue).optional();

const ScriptObject = z
  .object({
    script: z.string().min(1, { message: 'script must be a non-empty string' }),
    warnPattern: z
      .string()
      .min(1, { message: 'warnPattern must be a non-empty string' })
      .optional()
      .refine((v) => (typeof v === 'string' ? isValidRegex(v) : true), {
        message: 'warnPattern: invalid regular expression',
      }),
  })
  .strict();

export const ScriptsSchema = z
  .record(z.union([z.string().min(1), ScriptObject]))
  .default({});

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

const CliDefaultsRun = z
  .object({
    archive: coerceBool,
    combine: coerceBool,
    keep: coerceBool,
    sequential: coerceBool,
    live: coerceBool,
    plan: coerceBool,
    hangWarn: z.coerce.number().int().positive().optional(),
    hangKill: z.coerce.number().int().positive().optional(),
    hangKillGrace: z.coerce.number().int().positive().optional(),
    scripts: z.union([z.boolean(), z.array(z.string())]).optional(),
  })
  .strict()
  .optional();

const CliDefaultsPatch = z
  .object({
    file: z.string().optional(),
  })
  .strict()
  .optional();

const CliDefaultsSnap = z
  .object({
    stash: coerceBool,
  })
  .strict()
  .optional();

export const CliDefaultsSchema = z
  .object({
    debug: coerceBool,
    boring: coerceBool,
    patch: CliDefaultsPatch,
    run: CliDefaultsRun,
    snap: CliDefaultsSnap,
  })
  .strict()
  .optional();

export const ConfigSchema = z
  .object({
    stanPath: z
      .string()
      .min(1, { message: 'stanPath must be a non-empty string' }),
    scripts: ScriptsSchema,
    includes: StrictStringArray,
    excludes: StrictStringArray,
    imports: ImportsSchema,
    maxUndos: z.coerce.number().int().positive().optional(),
    devMode: coerceBool,
    cliDefaults: CliDefaultsSchema,
    patchOpenCommand: z.string().optional(),
  })
  .strict();

export type ParsedConfig = z.infer<typeof ConfigSchema>;
