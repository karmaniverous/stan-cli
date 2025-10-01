/* REQUIREMENTS (current):
 * - Export makeCli(): Command — root CLI factory for the "stan" tool.
 * - Register subcommands: run, init, snap.
 * - Vector to interactive init when no config exists (root invocation with no args).
 * - Avoid invoking process.exit during tests; call cli.exitOverride().
 * - Help for root should include available script keys from config.
 */

import { Command, Option } from 'commander';

import { renderAvailableScriptsHelp } from '@/stan/help';
import { printVersionInfo } from '@/stan/version';

import { applyCliSafety, rootDefaults, tagDefault } from './cli-utils';
import { performInit, registerInit } from './init';
import { registerPatch } from './patch';
import { registerRun } from './runner';
import { registerSnap } from './snap';
/**
 * Build the root CLI (`stan`) without side effects (safe for tests). *
 * Registers the `run`, `init`, `snap`, and `patch` subcommands, installs
 * global `--debug` and `--boring` options, and renders the help footer
 * with available script keys.
 *
 * @returns New Commander `Command` instance.
 */
export const makeCli = (): Command => {
  const cli = new Command();
  // Resolve effective defaults from config (when present); fall back to built‑ins.
  const { debugDefault, boringDefault } = rootDefaults(process.cwd());

  cli.name('stan').description(
    // A clearer story than the prior one‑liner.
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

  cli.option('-v, --version', 'print version and baseline-docs status');

  // Root-level help footer: show available script keys
  cli.addHelpText('after', () => renderAvailableScriptsHelp(process.cwd())); // Ensure tests never call process.exit() and argv normalization is consistent
  applyCliSafety(cli);

  // Propagate -d/--debug to subcommands (set before any subcommand action)
  cli.hook('preAction', (thisCommand) => {
    try {
      const root = thisCommand.parent ?? thisCommand;
      const holder = root as unknown as {
        opts?: () => { debug?: boolean; boring?: boolean };
        getOptionValueSource?: (name: string) => string | undefined;
      };
      const opts = holder.opts?.() ?? {};

      // Resolve config defaults (best-effort)
      const { debugDefault, boringDefault } = rootDefaults(process.cwd());

      const src = holder.getOptionValueSource?.bind(root);
      const debugFromCli =
        src && src('debug') === 'cli' ? Boolean(opts.debug) : undefined;
      const boringFromCli =
        src && src('boring') === 'cli' ? Boolean(opts.boring) : undefined;

      const debugFinal =
        typeof debugFromCli === 'boolean' ? debugFromCli : debugDefault;
      const boringFinal =
        typeof boringFromCli === 'boolean' ? boringFromCli : boringDefault;
      if (debugFinal) process.env.STAN_DEBUG = '1';
      else {
        // Ensure negated flag clears any prior setting from defaults
        delete process.env.STAN_DEBUG;
      }
      if (boringFinal) {
        process.env.STAN_BORING = '1';
        process.env.FORCE_COLOR = '0';
        process.env.NO_COLOR = '1';
      } else {
        // Ensure negated flag clears any prior setting from defaults
        delete process.env.STAN_BORING;
        delete process.env.FORCE_COLOR;
        delete process.env.NO_COLOR;
      }
    } catch {
      // ignore
    }
  }); // Subcommands
  registerRun(cli);
  registerInit(cli);
  registerSnap(cli);
  registerPatch(cli);

  // Root action:
  // - If -v/--version: print extended version info and return.
  // - If config is missing: run interactive init (not forced) and create a snapshot.
  // - If config exists: print help page (no exit).
  cli.action(async () => {
    const opts = cli.opts<{
      debug?: boolean;
      boring?: boolean;
      version?: boolean;
    }>();
    // preAction already resolved and set env from flags>config>built-ins.

    if (opts.version) {
      const vmod = await import('@/stan/version');
      const info = await vmod.getVersionInfo(process.cwd());
      printVersionInfo(info);
      return;
    }

    const cwd = process.cwd();
    const cfgMod = await import('@/stan/config');
    const hasConfig = !!cfgMod.findConfigPathSync(cwd);

    if (!hasConfig) {
      await performInit(cli, { cwd, force: false });
      return;
    }

    // Print help information without invoking .help() (which throws on exit).
    console.log(cli.helpInformation());
  });

  return cli;
};
