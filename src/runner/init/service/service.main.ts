// src/runner/init/service/service.main.ts
import { findConfigPathSync } from '@karmaniverous/stan-core';

import { loadCliConfig } from '@/cli/config/load';

import { deriveUiSeeds } from './derive-ui';
import { ensureKey, ensureNsNode, hasOwn, isObj } from './helpers';
import { applyInteractiveChoices } from './interactive-apply';
import { maybeMigrateLegacyToNamespaced } from './migrate';
import { readExistingConfig } from './read-existing';
import { handleSnapshot } from './snapshot';
import { resolveEffectiveStanPath } from './stanpath';
import { ensureWorkspace } from './workspace';
import { writeConfigToDisk } from './write-config';

export const performInitService = async ({
  cwd = process.cwd(),
  force = false,
  preserveScripts = false,
  dryRun = false,
}: {
  cwd?: string;
  force?: boolean;
  preserveScripts?: boolean;
  dryRun?: boolean;
}): Promise<string | null> => {
  const existingPath = findConfigPathSync(cwd);
  const hasExisting = Boolean(existingPath);
  const defaultStanPath = '.stan';

  // Load existing config (raw) preserving key order; fallback to empty object.
  let base: Record<string, unknown> = await readExistingConfig(existingPath);

  // Track pre‑migration state to distinguish “already namespaced” from “just migrated”.
  const wasNamespaced = isObj(base['stan-core']) || isObj(base['stan-cli']);
  base = await maybeMigrateLegacyToNamespaced(base, existingPath, {
    force: force || dryRun,
  });
  const namespaced = isObj(base['stan-core']) || isObj(base['stan-cli']);
  const namespacedTarget = namespaced || !hasExisting;

  // UI seeds (best-effort) for interactive mode
  const uiSeeds = await deriveUiSeeds(cwd, base, defaultStanPath);

  // Idempotency guard: under --force with an existing, already namespaced config,
  // do not re-serialize the file (preserve exact bytes/formatting).
  if (force && existingPath && namespaced && wasNamespaced) {
    // Still ensure workspace/snapshot below.
    const stanPathEff = resolveEffectiveStanPath(base, defaultStanPath);
    await ensureWorkspace(cwd, stanPathEff, dryRun, existingPath);
    await handleSnapshot({
      cwd,
      stanPath: stanPathEff,
      base,
      force,
      dryRun,
    });
    return existingPath;
  }

  // Interactive merge: apply only what the user directed; otherwise keep existing settings.
  if (!force && !dryRun) {
    await applyInteractiveChoices({
      cwd,
      base,
      namespaced: namespacedTarget,
      uiSeeds: {
        stanPath: uiSeeds.stanPath,
        includes: uiSeeds.includes,
        excludes: uiSeeds.excludes,
        scripts: uiSeeds.scripts,
      },
      preserveScripts,
    });

    // patchOpenCommand: keep existing when present; otherwise ensure a sensible default
    const cliCfg = uiSeeds.cliCfg;
    const poc =
      cliCfg?.patchOpenCommand && typeof cliCfg.patchOpenCommand === 'string'
        ? cliCfg.patchOpenCommand
        : 'code -g {file}';
    if (namespacedTarget) {
      const cli = ensureNsNode(base, 'stan-cli');
      if (!hasOwn(cli, 'patchOpenCommand')) cli.patchOpenCommand = poc;
      if (hasOwn(base, 'patchOpenCommand')) delete base.patchOpenCommand;
    } else if (
      !Object.prototype.hasOwnProperty.call(base, 'patchOpenCommand')
    ) {
      ensureKey(base, 'patchOpenCommand', poc);
    }
  }

  // --force: be non-destructive when a config already exists.
  if (force) {
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
    if (!existingPath) {
      // First-time creation: seed a namespaced config immediately.
      base = {
        'stan-core': {
          stanPath: defaultStanPath,
          includes: [],
          excludes: [],
        },
        'stan-cli': {
          // Narrow safely instead of relying on a cast + “?? {}”.
          scripts:
            cliCfg && typeof cliCfg.scripts === 'object'
              ? (cliCfg.scripts as Record<string, string>)
              : ({} as Record<string, string>),
          patchOpenCommand: cliCfg?.patchOpenCommand ?? 'code -g {file}',
        },
      } as Record<string, unknown>;
    } else if (!namespaced) {
      // Legacy layout (ensure minimums only)
      ensureKey(
        base,
        'stanPath',
        uiSeeds.defaults?.stanPath ?? defaultStanPath,
      );
      ensureKey(
        base,
        'includes',
        Array.isArray((base as { includes?: unknown }).includes)
          ? (base as { includes?: string[] }).includes
          : [],
      );
      ensureKey(
        base,
        'excludes',
        Array.isArray((base as { excludes?: unknown }).excludes)
          ? (base as { excludes?: string[] }).excludes
          : [],
      );
      ensureKey(base, 'scripts', cliCfg?.scripts ?? {});
      ensureKey(
        base,
        'patchOpenCommand',
        cliCfg?.patchOpenCommand ?? 'code -g {file}',
      );
    }
  }

  // Serialize back, honoring existing extension
  const targetPath = await writeConfigToDisk({
    cwd,
    existingPath,
    base,
    dryRun,
  });

  // Resolve effective stanPath (prefer stan-core); reuse UI resolution.
  const stanPath = resolveEffectiveStanPath(base, defaultStanPath);

  // Workspace + docs
  await ensureWorkspace(cwd, stanPath, dryRun, targetPath);

  // Snapshot
  await handleSnapshot({ cwd, stanPath, base, force, dryRun });

  return targetPath;
};
