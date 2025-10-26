// src/runner/init/service/interactive-apply.ts
import { promptForConfig, readPackageJsonScripts } from '../prompts';
import { ensureNsNode, hasOwn, setKey } from './helpers';

/** Apply interactive choices to the base config (mutates). */
export const applyInteractiveChoices = async (args: {
  cwd: string;
  base: Record<string, unknown>;
  namespaced: boolean;
  uiSeeds: {
    stanPath: string;
    includes: string[];
    excludes: string[];
    scripts: Record<string, string>;
  };
  preserveScripts: boolean;
}): Promise<void> => {
  const { cwd, base, namespaced, uiSeeds, preserveScripts } = args;
  const scriptsFromPkg = await readPackageJsonScripts(cwd);
  const picked = await promptForConfig(
    cwd,
    scriptsFromPkg,
    {
      stanPath: uiSeeds.stanPath,
      includes: uiSeeds.includes,
      excludes: uiSeeds.excludes,
      scripts: uiSeeds.scripts,
    },
    preserveScripts,
  );

  // Engine keys
  if (namespaced) {
    const core = ensureNsNode(base, 'stan-core');
    core.stanPath = picked.stanPath;
    core.includes = picked.includes;
    core.excludes = picked.excludes;
    delete (base as { stanPath?: unknown }).stanPath;
    delete (base as { includes?: unknown }).includes;
    delete (base as { excludes?: unknown }).excludes;
  } else {
    setKey(base, 'stanPath', picked.stanPath);
    setKey(base, 'includes', picked.includes);
    setKey(base, 'excludes', picked.excludes);
  }

  // Scripts (preserve optional)
  const preserving =
    (picked as { preserveScripts?: boolean }).preserveScripts === true ||
    preserveScripts === true;
  if (namespaced) {
    const cli = ensureNsNode(base, 'stan-cli');
    if (!preserving) cli.scripts = picked.scripts;
    else if (!hasOwn(cli, 'scripts')) cli.scripts = picked.scripts;
    if (hasOwn(base, 'scripts')) delete base.scripts;
  } else {
    if (!preserving) {
      setKey(base, 'scripts', picked.scripts);
    } else if (!Object.prototype.hasOwnProperty.call(base, 'scripts')) {
      setKey(base, 'scripts', picked.scripts);
    }
  }
};
