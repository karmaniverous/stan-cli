/* Root CLI factory — decomposed into small, testable modules.
 * - Preserves makeCli() public API.
 * - Registers run/init/snap/patch.
 * - Root defaults/env tagging extracted to src/cli/root/defaults.ts and env.ts.
 */
import { findConfigPathSync } from '@karmaniverous/stan-core';
import { Command, Option } from 'commander';

import { renderAvailableScriptsHelp } from '@/runner/help';
import { getVersionInfo, printVersionInfo } from '@/runner/version';

import { applyCliSafety, tagDefault } from './cli-utils';
import { performInit, registerInit as registerInitNamed } from './init';
import { registerPatch } from './patch';
import { readRootDefaultsFromConfig } from './root/defaults';
import { installRootEnvPreAction } from './root/env';
import { attachSubcommands } from './root/subcommands';
import { switchToWorkspace } from './root/workspace';
import { registerRun } from './runner';
import { registerSnap } from './snap';

export const makeCli = (): Command => {
  const cli = new Command();

  // Safety (idempotent)
  applyCliSafety(cli);

  // Effective defaults from config (or baseline fallback)
  const safeRootDefaults = (): {
    debugDefault: boolean;
    boringDefault: boolean;
    yesDefault: boolean;
  } => {
    try {
      const viaConfig = readRootDefaultsFromConfig(process.cwd());
      if (viaConfig) return viaConfig;
    } catch {
      // fallthrough to baseline
    }
    return { debugDefault: false, boringDefault: false, yesDefault: false };
  };
  const { debugDefault, boringDefault } = safeRootDefaults();

  // Root metadata & options
  cli
    .name('stan')
    .description(
      'Snapshot your repo and deterministic outputs, attach archives in chat, and safely round‑trip unified‑diff patches.',
    );

  const optDebug = new Option('-d, --debug', 'enable verbose debug logging');
  const optNoDebug = new Option(
    '-D, --no-debug',
    'disable verbose debug logging',
  );
  tagDefault(debugDefault ? optDebug : optNoDebug, true);
  cli.addOption(optDebug).addOption(optNoDebug);

  const optBoring = new Option(
    '-b, --boring',
    'disable all color and styling (useful for tests/CI)',
  );
  const optNoBoring = new Option(
    '-B, --no-boring',
    'do not disable color/styling',
  );
  tagDefault(boringDefault ? optBoring : optNoBoring, true);
  cli.addOption(optBoring).addOption(optNoBoring);

  const optWorkspace = new Option(
    '-w, --workspace <query>',
    'switch to a workspace package or directory context',
  );
  cli.addOption(optWorkspace);
  cli.hook('preAction', async (thisCommand) => {
    const opts = thisCommand.opts<{ workspace?: string }>();
    if (opts.workspace) {
      await switchToWorkspace(process.cwd(), opts.workspace);
    }
  });

  cli.option('-v, --version', 'print version and baseline-docs status');

  // Help footer: list available script keys
  cli.addHelpText('after', () => renderAvailableScriptsHelp(process.cwd()));

  // (applyCliSafety already called above)

  // Root env propagation (flags > env > defaults)
  installRootEnvPreAction(cli, safeRootDefaults);

  // Subcommands (SSR‑robust registrars)
  attachSubcommands(cli, {
    registerRun,
    registerSnap,
    registerInit: registerInitNamed,
    registerPatch,
  });

  // Root action (version, interactive init, or help)
  cli.action(async () => {
    const opts = cli.opts<{ version?: boolean }>();
    if (opts.version) {
      const info = await getVersionInfo(process.cwd());
      printVersionInfo(info);
      return;
    }
    const cwd = process.cwd();
    const hasConfig = !!findConfigPathSync(cwd);
    if (!hasConfig) {
      await performInit(cli, { cwd, force: false });
      return;
    }
    console.log(cli.helpInformation());
  });

  return cli;
};
