// src/runner/init/service/derive-ui.ts
import type { ContextConfig } from '@karmaniverous/stan-core';
import { loadConfig } from '@karmaniverous/stan-core';

import { loadCliConfig } from '@/cli/config/load';

import { isObj } from './helpers';
import { resolveIncludesExcludes } from './selection';
import { resolveEffectiveStanPath } from './stanpath';

export type UiSeeds = {
  stanPath: string;
  includes: string[];
  excludes: string[];
  scripts: Record<string, string>;
  defaults?: Partial<ContextConfig>;
  cliCfg?:
    | {
        scripts?: Record<string, unknown>;
        patchOpenCommand?: string;
      }
    | undefined;
};

/** Resolve UI defaults from base+cli for prompts (safe when engine cannot load legacy yet). */
export const deriveUiSeeds = async (
  cwd: string,
  base: Record<string, unknown>,
  defaultStanPath: string,
): Promise<UiSeeds> => {
  let defaults: Partial<ContextConfig> | undefined;
  try {
    defaults = await loadConfig(cwd);
  } catch {
    defaults = undefined;
  }
  let cliCfg:
    | {
        scripts?: Record<string, unknown>;
        patchOpenCommand?: string;
      }
    | undefined;
  try {
    cliCfg = await loadCliConfig(cwd);
  } catch {
    cliCfg = undefined;
  }
  const uiStanPath = resolveEffectiveStanPath(base, defaultStanPath);
  const uiSel = resolveIncludesExcludes(base);
  const uiScripts =
    (isObj(base['stan-cli']) && isObj(base['stan-cli'].scripts)
      ? ((base['stan-cli'] as { scripts?: Record<string, string> }).scripts ??
        {})
      : (cliCfg?.scripts as Record<string, string>)) ?? {};
  return {
    stanPath: uiStanPath,
    includes: uiSel.includes,
    excludes: uiSel.excludes,
    scripts: uiScripts,
    defaults,
    cliCfg,
  };
};
