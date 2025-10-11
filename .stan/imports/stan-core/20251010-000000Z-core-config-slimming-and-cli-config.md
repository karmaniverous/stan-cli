# Interop — core config slimming and CLI config extraction (x‑stan‑cli)

Summary
- stan-core will validate only the minimal engine config: stanPath, includes, excludes, imports. The schema will allow unknown keys (via catchall) so current configs with CLI keys still parse.
- stan-cli should move its config (scripts, cliDefaults, patchOpenCommand, maxUndos, devMode) under a vendor extension key x-stan-cli, while continuing to accept the legacy top-level keys during a transition.
- This note includes the plan of attack and drop-in code (schemas, loader, defaults). Size ~200 LOC. No core APIs change; only config placement and validation.

Plan of attack (CLI)
1) Add a namespaced CLI section to stan.config.*:
   - Preferred shape:
     ```yaml
     x-stan-cli:
       scripts:
         test: npm run test
         lint: npm run lint
       cliDefaults:
         run:
           sequential: true
           plan: false
       patchOpenCommand: code -g {file}
       maxUndos: 10
       devMode: false
     ```
   - Transition path: if x-stan-cli is missing, accept legacy top-level keys (scripts, cliDefaults, patchOpenCommand, maxUndos, devMode) so existing repos remain compatible.
   - If both exist, prefer x-stan-cli (optionally warn once).
2) Add the following files to stan-cli:
   - src/cli/config/defaults.ts (DEFAULT_OPEN_COMMAND)
   - src/cli/config/schema.ts (Zod schemas + helpers)
   - src/cli/config/load.ts (extract + validate x-stan-cli or legacy keys)
3) Wire-up:
   - In CLI bootstrap, read the repo config path, parse the file, then:
     - coreConfig = await core.loadConfig(cwd)  // base (stanPath/includes/excludes/imports)
     - cliConfig = await loadCliConfig(cwd)     // new CLI section with fallback
   - Replace existing uses of core’s legacy CLI fields in the CLI code paths with cliConfig.
4) Tests (minimal):
   - warnPattern validation, reserved script keys (“archive”, “init”), boolean coercion for cliDefaults, and dual-path acceptance (x-stan-cli vs top-level).

Acceptance criteria
- CLI accepts both x-stan-cli and legacy top-level keys (prefers x-stan-cli).
- Core 0.2+ minimal schema imposes no breaking behavior on current CLI: unknown keys in stan.config.* are tolerated.
- After CLI releases with this change, we can remove legacy references from stan-core’s own stan.config.yml (or move under x-stan-cli) without breaking local workflows.

Code resources (drop-in)

Add file: src/cli/config/defaults.ts
```ts
/* src/cli/config/defaults.ts
 * CLI-local defaults and constants.
 */

/** Default command to open modified files after a successful patch. */
export const DEFAULT_OPEN_COMMAND = 'code -g {file}';
```

Add file: src/cli/config/schema.ts
```ts
/* src/cli/config/schema.ts
 * Zod schemas and helpers for stan-cli configuration (x-stan-cli).
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

// scripts: union string | { script, warnPattern? }
export type ScriptEntry = string | { script: string; warnPattern?: string };
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
    hangWarn: z.coerce.number().int().positive().optional(),
    hangKill: z.coerce.number().int().positive().optional(),
    hangKillGrace: z.coerce.number().int().positive().optional(),
    scripts: z.union([z.boolean(), z.array(z.string())]).optional(),
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

// Complete CLI config block (namespaced under x-stan-cli or legacy top-level)
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
export const ensureNoReservedScriptKeys = (scripts: Record<string, unknown>): void => {
  const bad = ['archive', 'init'].filter((k) =>
    Object.prototype.hasOwnProperty.call(scripts ?? {}, k),
  );
  if (bad.length > 0) {
    // Stable wording for tests/logs:
    throw new Error(`scripts: keys "archive" and "init" not allowed`);
  }
};
```

Add file: src/cli/config/load.ts
```ts
/* src/cli/config/load.ts
 * Load and validate stan-cli configuration from stan.config.*.
 * Strategy: prefer x-stan-cli; fallback to legacy top-level keys for transition.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ZodError } from 'zod';

import { findConfigPathSync } from '@karmaniverous/stan-core';

import {
  cliConfigSchema,
  ensureNoReservedScriptKeys,
  type CliConfig,
  type ScriptMap,
} from './schema';
import { DEFAULT_OPEN_COMMAND } from './defaults';

const formatZodError = (e: unknown): string => {
  if (!(e instanceof ZodError)) return String(e);
  return e.issues
    .map((i) => {
      const p = i.path.join('.') || '(root)';
      let msg = i.message;
      if (p.endsWith('script')) msg = 'script must be a non-empty string';
      if (p.endsWith('warnPattern') && /invalid/i.test(msg)) {
        msg = 'warnPattern: invalid regular expression';
      }
      return `${p}: ${msg}`;
    })
    .join('\n');
};

type RawConfig = Record<string, unknown>;

const pickLegacyCliSection = (o: RawConfig): RawConfig => {
  const keys = ['scripts', 'cliDefaults', 'patchOpenCommand', 'maxUndos', 'devMode'];
  const out: RawConfig = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k] as unknown;
  return out;
};

export type LoadedCliConfig = {
  scripts: ScriptMap;
  cliDefaults?: CliConfig['cliDefaults'];
  patchOpenCommand: string;
  maxUndos?: number;
  devMode?: boolean;
};

/** Load and validate the CLI config (x-stan-cli preferred; legacy top-level fallback). */
export const loadCliConfig = async (cwd: string): Promise<LoadedCliConfig> => {
  const p = findConfigPathSync(cwd);
  if (!p) {
    // Accept empty CLI config; callers may supply defaults.
    return { scripts: {}, patchOpenCommand: DEFAULT_OPEN_COMMAND };
  }
  const rawText = await readFile(p, 'utf8');
  const cfgUnknown: unknown = p.endsWith('.json')
    ? (JSON.parse(rawText) as unknown)
    : (YAML.parse(rawText) as unknown);
  const obj = (cfgUnknown && typeof cfgUnknown === 'object' ? (cfgUnknown as RawConfig) : {}) as RawConfig;

  // Prefer namespaced x-stan-cli; otherwise pick legacy top-level keys.
  const namespaced = obj['x-stan-cli'] as unknown;
  const candidate =
    namespaced && typeof namespaced === 'object'
      ? (namespaced as RawConfig)
      : pickLegacyCliSection(obj);

  let parsed: CliConfig;
  try {
    parsed = cliConfigSchema.parse(candidate);
  } catch (e) {
    throw new Error(formatZodError(e));
  }

  // Guard reserved script keys (“archive”, “init”) to avoid conflicts with CLI entry points.
  ensureNoReservedScriptKeys(parsed.scripts ?? {});

  return {
    scripts: (parsed.scripts ?? {}) as ScriptMap,
    cliDefaults: parsed.cliDefaults,
    patchOpenCommand: parsed.patchOpenCommand ?? DEFAULT_OPEN_COMMAND,
    maxUndos: parsed.maxUndos,
    devMode: parsed.devMode,
  };
};
```

Wiring checklist (CLI)
- Import and call loadCliConfig(cwd) where the CLI composes flags/defaults with repo config.
- Replace any usage of legacy CLI fields from core.loadConfig() with the result from loadCliConfig().
- Keep the legacy top-level fallback enabled until downstream repos migrate to x-stan-cli. Prefer x-stan-cli if both are present.
- Keep unit tests that pin warnPattern validation, reserved script keys, boolean coercion, and dual-path acceptance.

Release ordering (no breakage)
1) stan-core: publish minimal config schema (stanPath/includes/excludes/imports) that allows unknown keys (catchall). Do not change stan-core’s stan.config.yml yet.
2) stan-cli: adopt this interop; release with dual-path config (x-stan-cli preferred; legacy accepted).
3) Optional later: move stan-core’s own CLI keys under x-stan-cli or remove them; tidy docs.
