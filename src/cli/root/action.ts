// src/cli/root/action.ts
import { findConfigPathSync } from '@karmaniverous/stan-core';
import type { Command } from 'commander';

import { printVersionInfo } from '@/runner/version';

import { performInit } from '../init';

export const installRootAction = (cli: Command): void => {
  cli.action(async () => {
    const opts = cli.opts<{ version?: boolean }>();
    if (opts.version) {
      const vmod = await import('@/runner/version');
      const info = await vmod.getVersionInfo(process.cwd());
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
};
