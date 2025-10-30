// src/cli/root/env.ts
import type { Command } from 'commander';

/** Install root preAction to resolve STAN_DEBUG/STAN_BORING and color flags. */
export const installRootEnvPreAction = (
  cli: Command,
  safeRootDefaults: () => {
    debugDefault: boolean;
    boringDefault: boolean;
    yesDefault: boolean;
  },
): void => {
  cli.hook('preAction', (thisCommand) => {
    try {
      const envDebugActive = process.env.STAN_DEBUG === '1';
      const root = thisCommand.parent ?? thisCommand;
      const holder = root as unknown as {
        opts?: () => { debug?: boolean; boring?: boolean };
        getOptionValueSource?: (name: string) => string | undefined;
      };
      const opts = holder.opts?.() ?? {};

      const { debugDefault, boringDefault } = safeRootDefaults();
      const src = holder.getOptionValueSource?.bind(root);

      const debugFromCli =
        src && src('debug') === 'cli' ? Boolean(opts.debug) : undefined;
      const boringFromCli =
        src && src('boring') === 'cli' ? Boolean(opts.boring) : undefined;

      let debugFinal = debugDefault;
      if (typeof debugFromCli === 'boolean') debugFinal = debugFromCli;
      else if (envDebugActive) debugFinal = true;

      const boringFinal =
        typeof boringFromCli === 'boolean' ? boringFromCli : boringDefault;

      if (debugFinal) process.env.STAN_DEBUG = '1';
      else delete process.env.STAN_DEBUG;

      if (boringFinal) {
        process.env.STAN_BORING = '1';
        process.env.FORCE_COLOR = '0';
        process.env.NO_COLOR = '1';
      } else {
        delete process.env.STAN_BORING;
        delete process.env.FORCE_COLOR;
        delete process.env.NO_COLOR;
      }
    } catch {
      /* best-effort */
    }
  });
};
