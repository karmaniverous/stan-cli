/**
 * Shared Commander helpers for STAN CLI.
 * - Safety patches (exit override, argv normalization).
 * - Option tagging and source introspection.
 */
import type { Command, Option } from 'commander';

const isStringArray = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.every((t) => typeof t === 'string');

/** Safe wrapper for Commander’s getOptionValueSource (avoid unbound method usage). */
export const getOptionSource = (
  cmd: Command,
  name: string,
): string | undefined => {
  try {
    const holder = cmd as unknown as {
      getOptionValueSource?: (n: string) => string | undefined;
    };
    const fn = holder.getOptionValueSource;
    return typeof fn === 'function' ? fn.call(cmd, name) : undefined;
  } catch {
    return undefined;
  }
};

/** Normalize argv from unit tests like ["node","stan", ...] -\> [...] */
export const normalizeArgv = (
  argv?: readonly string[],
): readonly string[] | undefined => {
  if (!isStringArray(argv)) return undefined;
  if (argv.length >= 2 && argv[0] === 'node' && argv[1] === 'stan') {
    return argv.slice(2);
  }
  return argv;
};

/** Patch parse() and parseAsync() to normalize argv before Commander parses. */
export const patchParseMethods = (cli: Command): void => {
  type FromOpt = { from?: 'user' | 'node' };
  type ParseFn = (argv?: readonly string[], opts?: FromOpt) => Command;
  type ParseAsyncFn = (
    argv?: readonly string[],
    opts?: FromOpt,
  ) => Promise<Command>;

  const holder = cli as unknown as {
    parse: ParseFn;
    parseAsync: ParseAsyncFn;
  };

  const origParse = holder.parse.bind(cli);
  const origParseAsync = holder.parseAsync.bind(cli);

  holder.parse = (argv?: readonly string[], opts?: FromOpt) => {
    origParse(normalizeArgv(argv), opts);
    return cli;
  };

  holder.parseAsync = async (argv?: readonly string[], opts?: FromOpt) => {
    await origParseAsync(normalizeArgv(argv), opts);
    return cli;
  };
};

/** Install a Commander exit override that swallows benign exits during tests. */
export const installExitOverride = (cmd: Command): void => {
  cmd.exitOverride((err) => {
    // Swallow benign/expected exits to avoid noisy stack traces in CLI usage.
    const swallow = new Set<string>([
      'commander.helpDisplayed',
      'commander.unknownCommand',
      'commander.unknownOption',
      'commander.help',
      // New: treat excess arguments as a friendly help case.
      'commander.excessArguments',
    ]);
    if (swallow.has(err.code)) {
      if (err.code === 'commander.excessArguments') {
        try {
          // Print concise message then help footer.
          // Commander typically prints the message already; ensure help is shown.
          // Avoid rethrowing to prevent stack traces.
          if (err.message) console.error(err.message);
          cmd.outputHelp();
        } catch {
          // best-effort
        }
      }
      return;
    }
    throw err;
  });
};

/** Apply both safety adapters to a command. */
export function applyCliSafety(cmd: Command): void {
  try {
    installExitOverride(cmd);
    patchParseMethods(cmd);
  } catch {
    /* best-effort */
  }
}

/** Tag an Option description with (default) when active. */
export function tagDefault(opt: Option, on: boolean): void {
  if (on && !opt.description.includes('(default)')) {
    opt.description = `${opt.description} (default)`;
  }
}
