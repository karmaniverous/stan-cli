/* src/stan/init/service/index.ts */
import type { PathLike } from 'node:fs';
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
import { maybeMigrateLegacyToNamespaced } from './migrate';

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object';

const hasOwn = (o: Record<string, unknown>, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

/** Ensure a namespaced node exists on base and return it (preserves insertion order best‑effort). */
const ensureNsNode = (
  base: Record<string, unknown>,
  key: 'stan-core' | 'stan-cli',
): Record<string, unknown> => {
  if (!isObj(base[key])) base[key] = {};
  return base[key] as Record<string, unknown>;
};

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
}: {
  cwd?: string;
  force?: boolean;
  preserveScripts?: boolean;
}): Promise<string | null> => {
  const existingPath = findConfigPathSync(cwd);

  const defaultStanPath = '.stan';
  await ensureOutputDir(cwd, defaultStanPath, true);

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

  // Offer migration to namespaced layout (stan-core / stan-cli); idempotent when already namespaced.
  base = await maybeMigrateLegacyToNamespaced(base, existingPath, { force });
  const namespaced = isObj(base['stan-core']) || isObj(base['stan-cli']);

  // Typed/defaulted view used for prompting and path resolution (best-effort)
  let defaults: Partial<ContextConfig> | undefined;
  try {
    defaults = await loadConfig(cwd);
  } catch {
    defaults = undefined;
  }

  // Also read CLI config for scripts/patchOpenCommand seeds (best-effort)
  let cliCfg:
    | { scripts?: Record<string, unknown>; patchOpenCommand?: string }
    | undefined;
  try {
    cliCfg = await loadCliConfig(cwd);
  } catch {
    cliCfg = undefined;
  }

  // Merge strategy helpers (preserve insertion order; modify in place)
  const ensureKey = <T>(
    obj: Record<string, unknown>,
    key: string,
    value: T,
  ): void => {
    if (!Object.prototype.hasOwnProperty.call(obj, key))
      obj[key] = value as unknown;
  };

  const setKey = <T>(
    obj: Record<string, unknown>,
    key: string,
    value: T,
  ): void => {
    obj[key] = value as unknown; // replace value without reordering the key itself
  };

  // Interactive merge: apply only what the user directed; otherwise keep existing settings.
  if (!force) {
    const scriptsFromPkg = await readPackageJsonScripts(cwd);
    const picked = await promptForConfig(
      cwd,
      scriptsFromPkg,
      defaults
        ? {
            stanPath: defaults.stanPath ?? defaultStanPath,
            includes: defaults.includes ?? [],
            excludes: defaults.excludes ?? [],
            // seed scripts for prompt from CLI config when available
            scripts: (cliCfg?.scripts as Record<string, string>) ?? {},
          }
        : undefined,
      preserveScripts,
    );

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
      // Legacy layout (should be rare after migration); keep root keys
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
    } else if (!Object.prototype.hasOwnProperty.call(base, 'patchOpenCommand'))
      ensureKey(base, 'patchOpenCommand', poc);
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
      // Ensure minimally-required keys exist.
      if (namespaced) {
        const core = ensureNsNode(base, 'stan-core');
        if (!hasOwn(core, 'stanPath'))
          core.stanPath = defaults?.stanPath ?? defaultStanPath;
        if (!hasOwn(core, 'includes')) {
          const inc =
            isObj(core) &&
            Array.isArray((core as { includes?: unknown }).includes)
              ? (core as { includes?: string[] }).includes
              : [];
          core.includes = inc;
        }
        if (!hasOwn(core, 'excludes')) {
          const exc =
            isObj(core) &&
            Array.isArray((core as { excludes?: unknown }).excludes)
              ? (core as { excludes?: string[] }).excludes
              : [];
          core.excludes = exc;
        }
        const cli = ensureNsNode(base, 'stan-cli');
        if (!hasOwn(cli, 'scripts')) cli.scripts = cliCfg?.scripts ?? {};
        if (!hasOwn(cli, 'patchOpenCommand')) {
          cli.patchOpenCommand = cliCfg?.patchOpenCommand ?? 'code -g {file}';
        }
        // Remove any legacy root duplicates that may have been present
        delete (base as { stanPath?: unknown }).stanPath;
        delete (base as { includes?: unknown }).includes;
        delete (base as { excludes?: unknown }).excludes;
        if (hasOwn(base, 'scripts')) delete base.scripts;
        if (hasOwn(base, 'patchOpenCommand')) delete base.patchOpenCommand;
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
  if (existingPath && existingPath.endsWith('.json')) {
    const json = JSON.stringify(base, null, 2);
    await writeFile(targetPath, json, 'utf8');
  } else {
    const yml = YAML.stringify(base);
    await writeFile(targetPath, yml, 'utf8');
  }

  // Resolve effective stanPath from the merged object (prefer stan-core)
  const stanPath = (() => {
    const core = (base['stan-core'] ?? {}) as Record<string, unknown>;
    const sp =
      isObj(core) &&
      typeof (core as { stanPath?: unknown }).stanPath === 'string'
        ? String((core as { stanPath: string }).stanPath).trim()
        : typeof (base as { stanPath?: unknown }).stanPath === 'string'
          ? String((base as { stanPath: string }).stanPath).trim()
          : '';
    return sp.length ? sp : defaultStanPath;
  })();

  await ensureStanGitignore(cwd, stanPath);
  await ensureDocs(cwd, stanPath);

  console.log(`stan: wrote ${path.basename(targetPath)}`);

  // Snapshot behavior:
  // - If no snapshot exists, do not prompt; create it.
  // - If a snapshot exists:
  //   - Interactive: prompt "Keep existing snapshot?" (default Yes).
  //   - Force: keep by default (no prompt).
  const snapPath = path.join(cwd, stanPath, 'diff', '.archive.snapshot.json');
  const snapExists = existsSync(snapPath);

  // Compute includes/excludes from stan-core when namespaced; fall back to root
  const resolveSelection = (): { includes: string[]; excludes: string[] } => {
    const core = (base['stan-core'] ?? {}) as Record<string, unknown>;
    if (isObj(core)) {
      const inc = Array.isArray((core as { includes?: unknown }).includes)
        ? ((core as { includes?: string[] }).includes ?? [])
        : [];
      const exc = Array.isArray((core as { excludes?: unknown }).excludes)
        ? ((core as { excludes?: string[] }).excludes ?? [])
        : [];
      return { includes: inc, excludes: exc };
    }
    return {
      includes: (base as { includes?: string[] }).includes ?? [],
      excludes: (base as { excludes?: string[] }).excludes ?? [],
    };
  };

  const writeSnap = async (): Promise<void> => {
    const sel = resolveSelection();
    await writeArchiveSnapshot({
      cwd,
      stanPath,
      includes: sel.includes,
      excludes: sel.excludes,
    });
  };

  if (!snapExists) {
    // No snapshot present — create it without asking.
    await writeSnap();
    console.log('stan: snapshot updated');
  } else {
    if (force) {
      // Keep snapshot by default in --force mode.
      console.log('stan: snapshot unchanged');
    } else {
      try {
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
      } catch {
        // If prompting fails for any reason, err on the side of safety and keep the snapshot.
        console.log('stan: snapshot unchanged');
      }
    }
  }

  return targetPath;
};
