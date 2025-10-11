# Interop — config namespacing switch (stan-core/stan-cli top‑level)

Decision (immediate)
- Config files use explicit top‑level namespaces for consumers:
  - `stan-core`: engine‑owned keys (stanPath, includes, excludes, imports).
  - `stan-cli`: CLI‑owned keys (scripts, cliDefaults, patchOpenCommand, maxUndos, devMode).
- Backward compatibility is not a factor, except to keep STAN functional during the transition. The new layout is canonical effective now.

Rationale
- Eliminates key collisions by design; each consumer reads only its section.
- Lets core loaders be strict again (no foreign keys, no passthrough).
- Scales to more consumers without ambiguity.

What changes for CLI (required)
1) Loader precedence (breaking from earlier x‑stan‑cli plan)
   - Prefer ONLY `stan-cli` at the config root.
   - Do NOT read `x-stan-cli` or legacy top‑level keys in steady state.
   - During a short transition window (to keep STAN functional while both sides release), you MAY temporarily accept `x-stan-cli` or legacy keys, but this is not a long‑term promise; remove as soon as both packages ship.
2) Schema (unchanged from previous interop)
   - Keep `scripts` union (string | object{ script, warnPattern? } with regex validation).
   - Keep `cliDefaults` structure and coercions.
   - Keep guard against reserved script keys (“archive”, “init”).
3) Early, friendly error
   - If `stan-cli` block is missing, fail with one concise message (and guidance) before running anything.
4) Tests
   - Namespaced happy paths (YAML/JSON).
   - Early error when missing `stan-cli`.
   - Remove/disable x‑stan‑cli and legacy acceptance tests once releases are aligned.
5) Docs/help
   - Update examples to show the namespaced shape.
   - Clarify that `stan-cli` is the canonical location.

Canonical example
```yaml
stan-core:
  stanPath: .stan
  includes: []
  excludes:
    - CHANGELOG.md
  imports:
    cli-docs:
      - ../stan-cli/.stan/system/stan.requirements.md
      - ../stan-cli/.stan/system/stan.todo.md

stan-cli:
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

Drop‑in loader (CLI)
- Reuses prior `schema.ts` and `defaults.ts`. Only the loader changes to read `stan-cli` strictly.

```ts
/* src/cli/config/load.ts (namespaced) */
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

const formatZodError = (e: unknown): string =>
  e instanceof ZodError
    ? e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
    : String(e);

type RawConfig = Record<string, unknown>;

export type LoadedCliConfig = {
  scripts: ScriptMap;
  cliDefaults?: CliConfig['cliDefaults'];
  patchOpenCommand: string;
  maxUndos?: number;
  devMode?: boolean;
};

export const loadCliConfig = async (cwd: string): Promise<LoadedCliConfig> => {
  const cfgPath = findConfigPathSync(cwd);
  if (!cfgPath) throw new Error('stan-cli: config not found (stan.config.*)');
  const rawText = await readFile(cfgPath, 'utf8');
  const rootUnknown: unknown = cfgPath.endsWith('.json')
    ? (JSON.parse(rawText) as unknown)
    : (YAML.parse(rawText) as unknown);

  const root = (rootUnknown && typeof rootUnknown === 'object'
    ? (rootUnknown as RawConfig)
    : {}) as RawConfig;

  // Canonical, namespaced section
  const nodeUnknown = root['stan-cli'];
  if (!nodeUnknown || typeof nodeUnknown !== 'object') {
    const rel = path.relative(cwd, cfgPath).replace(/\\/g, '/');
    throw new Error(
      `stan-cli: missing "stan-cli" section in ${rel}. ` +
        'Add a top-level "stan-cli" object with scripts/cliDefaults/etc.',
    );
  }

  const node = nodeUnknown as RawConfig;
  let parsed: CliConfig;
  try {
    parsed = cliConfigSchema.parse(node);
  } catch (e) {
    throw new Error(formatZodError(e));
  }
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

Release notes (CLI)
- “Config now uses namespaced top‑level keys; use `stan-cli` for CLI options. Legacy shapes are no longer canonical and may be rejected.”
- “Examples and init templates updated accordingly.”

Follow‑through (core)
- Core will read from `stan-core` (strict) and stop tolerating foreign keys in the root. See core dev plan for sequencing.
