/* src/stan/init/service/index.ts */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import {
  ensureOutputDir,
  findConfigPathSync,
  loadConfig,
  writeArchiveSnapshot,
} from '@karmaniverous/stan-core';
import YAML from 'yaml';

import { loadCliConfig } from '@/cli/config/load';

import { ensureDocs } from '../docs';
import { ensureStanGitignore } from '../gitignore';
import { promptForConfig, readPackageJsonScripts } from '../prompts';
import { ensureKey, ensureNsNode, hasOwn, isObj, setKey } from './helpers';
import { maybeMigrateLegacyToNamespaced } from './migrate';
import { resolveIncludesExcludes } from './selection';
// SSR/ESM-robust resolver for resolveEffectiveStanPath (named-or-default)
import * as stanpathMod from './stanpath';
const resolveEffectiveStanPath: (typeof import('./stanpath'))['resolveEffectiveStanPath'] =
  ((): any => {
    try {
      const m = stanpathMod as unknown as {
        resolveEffectiveStanPath?: unknown;
        default?: { resolveEffectiveStanPath?: unknown };
      };
      return typeof m.resolveEffectiveStanPath === 'function'
        ? m.resolveEffectiveStanPath
        : (m.default as { resolveEffectiveStanPath?: unknown } | undefined)
            ?.resolveEffectiveStanPath;
    } catch {
      return undefined as unknown;
    }
  })() as (typeof import('./stanpath'))['resolveEffectiveStanPath'];

/**
 * Initialize or update STAN configuration and workspace assets.
 *
 * Behavior:
 * - Resolves defaults from an existing config when present.
 * - In interactive mode, prompts for stanPath, includes/excludes, and scripts.
 * - Writes the existing stan.config.* file (json|yml|yaml) when present (preserves key order);
 *   creates `stan.config.yml` when none exists.
 * - Ensures `.gitignore` entries and ships docs.
 * - Snapshot behavior: keep existing snapshot by default; create when missing.
 *
 * @param opts - Options `{ cwd, force, preserveScripts }`.
 * @returns Absolute path to the written config, or `null` on failure.
 */
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

  const defaultStanPath = '.stan';
  if (!dryRun) await ensureOutputDir(cwd, defaultStanPath, true);

  // Load existing config (raw) preserving key order; fallback to empty object.
  let base: Record<string, unknown> = {};
  if (existingPath) {
    try {
      const raw = await readFile(existingPath, 'utf8');
      const parsed: unknown = YAML.parse(raw);
      if (parsed && typeof parsed === 'object')
        base = parsed as Record<string, unknown>;
    } catch {
      // Non-fatal: treat as empty and continue with conservative behavior
      base = {};
    }
  }

  // Offer migration to namespaced layout (stan-core / stan-cli); idempotent when already namespaced).
  // Track pre‑migration state to distinguish “already namespaced” from “just migrated”.
  const wasNamespaced = isObj(base['stan-core']) || isObj(base['stan-cli']);
  base = await maybeMigrateLegacyToNamespaced(base, existingPath, {
    force: force || dryRun,
  });
  const namespaced = isObj(base['stan-core']) || isObj(base['stan-cli']);

  // Best‑effort typed view for engine (not authoritative for UI defaults)
  let defaults: Partial<ContextConfig> | undefined;
  try {
    defaults = await loadConfig(cwd);
  } catch {
    defaults = undefined;
  }

  // Also read CLI config for scripts/patchOpenCommand seeds (best‑effort)
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

  // Derive UI defaults from the (possibly migrated) in‑memory config so prompts
  // work even when the engine loader couldn't read legacy shapes yet.
  const uiStanPath = resolveEffectiveStanPath(base, defaultStanPath);
  const uiSel = resolveIncludesExcludes(base);
  const uiScripts: Record<string, string> = (() => {
    try {
      const cliNode = isObj(base['stan-cli']) ? base['stan-cli'] : null;
      if (cliNode && isObj(cliNode.scripts)) {
        const s = cliNode.scripts;
        if (Object.keys(s).length > 0) return s as Record<string, string>;
      }
    } catch {
      /* ignore */
    }
    return (cliCfg?.scripts as Record<string, string>) ?? {};
  })();

  // Idempotency guard: under --force with an existing, already namespaced config,
  // do not re-serialize the file (preserve exact bytes/formatting).
  // IMPORTANT: only treat as “already namespaced” when that was true BEFORE migration.
  // If we just migrated legacy → namespaced, we must write the transformed file.
  if (force && existingPath && namespaced && wasNamespaced) {
    // Still ensure workspace when not dry-run (done above).
    // Skip gitignore/docs/snapshot/prompts; pure no-op for the config file.
    return existingPath;
  }

  // Interactive merge: apply only what the user directed; otherwise keep existing settings.
  // In --dry-run, skip interactive prompts entirely (plan-only; no mutations).
  if (!force) {
    if (!dryRun) {
      const scriptsFromPkg = await readPackageJsonScripts(cwd);
      // Always seed UI defaults from migrated base + CLI loader to enable preserve‑scripts on legacy upgrades.
      const picked = await promptForConfig(
        cwd,
        scriptsFromPkg,
        {
          stanPath: uiStanPath,
          includes: uiSel.includes,
          excludes: uiSel.excludes,
          scripts: uiScripts,
        },
        preserveScripts,
      );

      // Apply picked values (interactive mode only)
      // Engine keys: prefer stan-core node when namespaced
      if (namespaced) {
        const core = ensureNsNode(base, 'stan-core');
        core.stanPath = picked.stanPath;
        core.includes = picked.includes;
        core.excludes = picked.excludes;
        // Remove any lingering legacy root copies to avoid duplication
        delete (base as { stanPath?: unknown }).stanPath;
        delete (base as { includes?: unknown }).includes;
        delete (base as { excludes?: unknown }).excludes;
      } else {
        // Legacy layout (should be rare after migration confirmation); keep root keys
        setKey(base, 'stanPath', picked.stanPath);
        setKey(base, 'includes', picked.includes);
        setKey(base, 'excludes', picked.excludes);
      }

      // scripts (respect 'preserve scripts' behavior)
      const preserving =
        (picked as { preserveScripts?: boolean }).preserveScripts === true ||
        preserveScripts === true;
      if (namespaced) {
        const cli = ensureNsNode(base, 'stan-cli');
        if (!preserving) {
          cli.scripts = picked.scripts;
        } else if (!hasOwn(cli, 'scripts')) {
          // If migration did not populate scripts, seed from picked defaults.
          cli.scripts = picked.scripts;
        }
        // Ensure we do not reintroduce a legacy root scripts key
        if (hasOwn(base, 'scripts')) delete base.scripts;
      } else {
        if (!preserving) {
          setKey(base, 'scripts', picked.scripts);
        } else if (!Object.prototype.hasOwnProperty.call(base, 'scripts')) {
          setKey(base, 'scripts', picked.scripts);
        }
      }

      // patchOpenCommand: keep existing when present; otherwise ensure a sensible default
      const poc =
        cliCfg?.patchOpenCommand && typeof cliCfg.patchOpenCommand === 'string'
          ? cliCfg.patchOpenCommand
          : 'code -g {file}';
      if (namespaced) {
        const cli = ensureNsNode(base, 'stan-cli');
        if (!hasOwn(cli, 'patchOpenCommand')) cli.patchOpenCommand = poc;
        // Remove any legacy root copy to avoid duplication
        if (hasOwn(base, 'patchOpenCommand')) delete base.patchOpenCommand;
      } else if (
        !Object.prototype.hasOwnProperty.call(base, 'patchOpenCommand')
      ) {
        ensureKey(base, 'patchOpenCommand', poc);
      }
    } else {
      // dry-run: do not prompt or mutate config
    }
  } else {
    // --force: be non-destructive when a config already exists.
    // Only ensure required keys. If no config exists, create a minimal one.
    if (!existingPath) {
      base = {
        excludes: [],
        includes: [],
        patchOpenCommand: 'code -g {file}',
        scripts: (cliCfg?.scripts as Record<string, string>) ?? {},
        stanPath: defaultStanPath,
      };
    } else {
      // For existing configs, avoid overwriting user settings.
      // Ensure minimally-required keys exist only for legacy layout.
      // Idempotency: when already namespaced, make no changes.
      if (namespaced) {
        // No-op for already namespaced configs under --force.
        // (Avoid injecting defaults like patchOpenCommand; keep file unchanged.)
      } else {
        ensureKey(base, 'stanPath', defaults?.stanPath ?? defaultStanPath);
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
  }

  // Determine target path: write back to existing filename/extension when present
  const targetPath = existingPath ?? path.join(cwd, 'stan.config.yml');

  // Serialize honoring the existing file’s format
  if (!dryRun) {
    if (existingPath && existingPath.endsWith('.json')) {
      const json = JSON.stringify(base, null, 2);
      await writeFile(targetPath, json, 'utf8');
    } else {
      const yml = YAML.stringify(base);
      await writeFile(targetPath, yml, 'utf8');
    }
  }

  // Resolve effective stanPath (prefer stan-core); reuse UI resolution.
  const stanPath = uiStanPath;

  if (!dryRun) {
    await ensureStanGitignore(cwd, stanPath);
    await ensureDocs(cwd, stanPath);
    console.log(`stan: wrote ${path.basename(targetPath)}`);
  } else {
    console.log(
      `stan: init (dry-run): would write ${path.basename(targetPath)}`,
    );
  }

  // Snapshot behavior:
  // - If no snapshot exists, do not prompt; create it.
  // - If a snapshot exists:
  //   - Interactive: prompt "Keep existing snapshot?" (default Yes).
  //   - Force: keep by default (no prompt).
  const snapPath = path.join(cwd, stanPath, 'diff', '.archive.snapshot.json');
  const snapExists = existsSync(snapPath);

  const writeSnap = async (): Promise<void> => {
    const sel = resolveIncludesExcludes(base);
    if (!dryRun) {
      await writeArchiveSnapshot({
        cwd,
        stanPath,
        includes: sel.includes,
        excludes: sel.excludes,
      });
    }
  };

  if (!snapExists) {
    // No snapshot present — create it without asking.
    if (!dryRun) {
      await writeSnap();
      console.log('stan: snapshot updated');
    } else {
      console.log('stan: snapshot unchanged (dry-run)');
    }
  } else {
    if (force) {
      // Keep snapshot by default in --force mode.
      console.log(
        dryRun
          ? 'stan: snapshot unchanged (dry-run)'
          : 'stan: snapshot unchanged',
      );
    } else {
      try {
        if (!dryRun) {
          const { default: inquirer } = (await import('inquirer')) as {
            default: { prompt: (qs: unknown[]) => Promise<unknown> };
          };
          const ans = (await inquirer.prompt([
            {
              type: 'confirm',
              name: 'keep',
              message: 'Keep existing snapshot?',
              default: true,
            },
          ])) as { keep?: boolean };
          if (ans.keep === false) {
            await writeSnap();
            console.log('stan: snapshot updated');
          } else {
            console.log('stan: snapshot unchanged');
          }
        } else {
          console.log('stan: snapshot unchanged (dry-run)');
        }
      } catch {
        // If prompting fails for any reason, err on the side of safety and keep the snapshot.
        console.log(
          dryRun
            ? 'stan: snapshot unchanged (dry-run)'
            : 'stan: snapshot unchanged',
        );
      }
    }
  }

  return targetPath;
};
