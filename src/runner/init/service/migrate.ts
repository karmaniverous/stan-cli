/* src/stan/init/service/migrate.ts
 * Namespaced config migration helper for `stan init`.
 * - Detect legacy root keys (engine + CLI) and migrate them to:
 *   - stan-core: { stanPath, includes, excludes, imports }
 *   - stan-cli:  { scripts, cliDefaults, patchOpenCommand, maxUndos, devMode }
 * - Also migrates legacy opts.cliDefaults -> stan-cli.cliDefaults (and removes opts when empty).
 * - Writes a .bak of the existing config file when migrating (best‑effort).
 * - Idempotent: if already namespaced and no legacy keys present, returns input unchanged.
 */
import { copyFile } from 'node:fs/promises';

const LEGACY_ENGINE_KEYS = [
  'stanPath',
  'includes',
  'excludes',
  'imports',
] as const;
const LEGACY_CLI_KEYS = [
  'scripts',
  'cliDefaults',
  'patchOpenCommand',
  'maxUndos',
  'devMode',
] as const;

type Dict = Record<string, unknown>;

const hasOwn = (o: Dict, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

const isObject = (v: unknown): v is Dict => v !== null && typeof v === 'object';

/** Return true if any legacy engine/CLI keys are present at the root. */
const hasLegacyRootKeys = (root: Dict): boolean => {
  return (
    LEGACY_ENGINE_KEYS.some((k) => hasOwn(root, k)) ||
    LEGACY_CLI_KEYS.some((k) => hasOwn(root, k)) ||
    (isObject(root.opts) && isObject(root.opts.cliDefaults))
  );
};

/** Shallow read/clone of a namespaced node if present, as a mutable Dict. */
const readNode = (root: Dict, key: 'stan-core' | 'stan-cli'): Dict => {
  const n = root[key];
  return isObject(n) ? { ...n } : ({} as Dict);
};

/** Attach node back if non‑empty; otherwise remove it. */
const attachNode = (
  root: Dict,
  key: 'stan-core' | 'stan-cli',
  node: Dict,
): void => {
  if (Object.keys(node).length > 0) root[key] = node;
  else if (hasOwn(root, key)) delete root[key];
};

/** Best‑effort config backup. */
const backupConfig = async (existingPath?: string | null): Promise<void> => {
  if (!existingPath) return;
  try {
    await copyFile(existingPath, `${existingPath}.bak`);
  } catch {
    /* best‑effort */
  }
};

/**
 * Maybe migrate legacy (root) config to the namespaced layout.
 *
 * @param base - Parsed config object (mutable).
 * @param existingPath - Absolute path to the config file (for .bak).
 * @param opts - Options controlling migration (when force is false, prompts the user to confirm).
 * @returns The same (possibly mutated) base object.
 */
export async function maybeMigrateLegacyToNamespaced(
  base: Dict,
  existingPath?: string | null,
  opts?: { force?: boolean },
): Promise<Dict> {
  const alreadyNamespaced =
    (hasOwn(base, 'stan-core') && isObject(base['stan-core'])) ||
    (hasOwn(base, 'stan-cli') && isObject(base['stan-cli']));

  const legacyPresent = hasLegacyRootKeys(base);
  if (!legacyPresent && alreadyNamespaced) return base;

  // Confirm when not --force and legacy present.
  let proceed = Boolean(opts?.force);
  if (!proceed && legacyPresent) {
    try {
      const { default: inquirer } = (await import('inquirer')) as {
        default: { prompt: (qs: unknown[]) => Promise<unknown> };
      };
      const ans = (await inquirer.prompt([
        {
          type: 'confirm',
          name: 'migrate',
          message:
            'Legacy config detected. Migrate to namespaced (stan-core/stan-cli) now?',
          default: true,
        },
      ])) as { migrate?: boolean };
      proceed = ans.migrate !== false;
    } catch {
      // If prompt fails for any reason, err on the safe side and proceed.
      proceed = true;
    }
  }
  if (!proceed) return base;

  await backupConfig(existingPath);

  // Seed from existing namespaces (do NOT overwrite present keys).
  const coreNode = readNode(base, 'stan-core');
  const cliNode = readNode(base, 'stan-cli');

  // Move engine keys (root -> stan-core) when not already set under stan-core.
  for (const k of LEGACY_ENGINE_KEYS) {
    if (hasOwn(base, k) && !hasOwn(coreNode, k)) {
      coreNode[k] = base[k];
    }
    if (hasOwn(base, k)) Reflect.deleteProperty(base, k);
  }

  // Move CLI keys (root -> stan-cli) when not already set under stan-cli.
  for (const k of LEGACY_CLI_KEYS) {
    if (hasOwn(base, k) && !hasOwn(cliNode, k)) {
      cliNode[k] = base[k];
    }
    if (hasOwn(base, k)) Reflect.deleteProperty(base, k);
  }

  // Special: legacy opts.cliDefaults -> stan-cli.cliDefaults
  if (isObject(base.opts)) {
    const optsNode = base.opts;
    if (isObject(optsNode.cliDefaults) && !hasOwn(cliNode, 'cliDefaults')) {
      cliNode.cliDefaults = optsNode.cliDefaults;
    }
    // Remove opts.cliDefaults; drop opts if empty.
    if (hasOwn(optsNode, 'cliDefaults')) delete optsNode.cliDefaults;
    if (Object.keys(optsNode).length === 0) delete base.opts;
  }

  attachNode(base, 'stan-core', coreNode);
  attachNode(base, 'stan-cli', cliNode);
  return base;
}
