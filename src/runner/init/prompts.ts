/* src/runner/init/prompts.ts */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ScriptMap } from '@/cli/config/schema';

const parseCsv = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export async function readPackageJsonScripts(
  cwd: string,
): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path.join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

type Picked = {
  stanPath: string;
  includes: string[];
  excludes: string[];
  scripts: ScriptMap;
};

/** Ask user for config values; preserve script set optionally. */
export async function promptForConfig(
  cwd: string,
  pkgScripts: Record<string, string>,
  defaults?: Partial<{
    stanPath: string;
    includes: string[];
    excludes: string[];
    scripts: ScriptMap;
  }>,
  preserveScriptsFromDefaults?: boolean,
): Promise<Picked> {
  const { default: inquirer } = (await import('inquirer')) as {
    default: { prompt: (qs: unknown[]) => Promise<unknown> };
  };
  const scriptKeys = Object.keys(pkgScripts);
  const defaultSelected = defaults?.scripts
    ? Object.keys(defaults.scripts).filter((k) => scriptKeys.includes(k))
    : [];

  const hasDefaults =
    !!defaults &&
    !!defaults.scripts &&
    Object.keys(defaults.scripts).length > 0;

  const answers = (await inquirer.prompt([
    {
      type: 'input',
      name: 'stanPath',
      message: 'STAN path:',
      default: defaults?.stanPath ?? '.stan',
    },
    {
      type: 'input',
      name: 'includes',
      message:
        'Paths to include (CSV; optional; overrides excludes when provided):',
      default: (defaults?.includes ?? []).join(','),
    },
    {
      type: 'input',
      name: 'excludes',
      message: 'Paths to exclude (CSV; optional):',
      default: (defaults?.excludes ?? []).join(','),
    },
    ...(hasDefaults
      ? [
          {
            type: 'confirm',
            name: 'preserveScripts',
            message: 'Preserve existing scripts from current config?',
            default: true,
          },
        ]
      : []),
    ...(scriptKeys.length
      ? [
          {
            type: 'checkbox',
            name: 'selectedScripts',
            message: 'Select scripts to include from package.json:',
            choices: scriptKeys.map((k) => ({
              name: `${k}: ${pkgScripts[k]}`,
              value: k,
            })),
            default: defaultSelected,
            loop: false,
            // When defaults exist, hide this selection step if preserving scripts.
            when: (a: { preserveScripts?: boolean }) =>
              hasDefaults ? !a.preserveScripts : true,
          },
        ]
      : []),
  ])) as {
    stanPath: string;
    includes: string;
    excludes: string;
    preserveScripts?: boolean;
    selectedScripts?: string[];
  };

  const outStan =
    typeof answers.stanPath === 'string' && answers.stanPath
      ? answers.stanPath.trim()
      : (defaults?.stanPath ?? '.stan');
  const includesCsv = answers.includes ?? '';
  const excludesCsv = answers.excludes ?? '';

  let scripts: ScriptMap = {};

  if ((answers.preserveScripts ?? preserveScriptsFromDefaults) && hasDefaults) {
    scripts = { ...(defaults.scripts as ScriptMap) };
  } else {
    const selected =
      Array.isArray(answers.selectedScripts) && answers.selectedScripts.length
        ? answers.selectedScripts.filter(
            (x): x is string => typeof x === 'string',
          )
        : [];
    for (const key of selected) scripts[key] = 'npm run ' + key;
  }

  return {
    stanPath: outStan,
    includes: includesCsv ? parseCsv(includesCsv) : [],
    excludes: excludesCsv ? parseCsv(excludesCsv) : [],
    scripts,
  };
}
