/** src/cli/patch/safety.ts
 * Local, module‑independent Commander safety (SSR/test friendly).
 * - Normalizes ["node","stan", ...] → [...]
 * - Installs exitOverride to swallow benign Commander exits in tests.
 */
import type { Command } from 'commander';

type FromOpt = { from?: 'user' | 'node' };

/** Normalize argv from tests like ["node","stan", ...] → [...] (strings only). */
const normalizeArgv = (
  argv?: readonly unknown[],
): readonly string[] | undefined => {
  if (!Array.isArray(argv)) return undefined;
  if (argv.length < 2) {
    return argv.every((t) => typeof t === 'string')
      ? (argv as readonly string[])
      : undefined;
  }
  const first = argv[0];
  const second = argv[1];
  if (typeof first !== 'string' || typeof second !== 'string') return undefined;
  if (first === 'node' && second === 'stan') {
    const rest = argv
      .slice(2)
      .filter((t): t is string => typeof t === 'string');
    return rest as readonly string[];
  }
  return argv as readonly string[];
};

/** Idempotently apply parse normalization + exit override to a command. */
export const applySafetyLocal = (cmd: Command): void => {
  // Swallow common Commander exits to keep tests quiet.
  try {
    cmd.exitOverride((err) => {
      const swallow = new Set<string>([
        'commander.helpDisplayed',
        'commander.unknownCommand',
        'commander.unknownOption',
        'commander.help',
        'commander.excessArguments',
      ]);
      if (swallow.has(err.code)) {
        if (err.code === 'commander.excessArguments') {
          try {
            if (err.message) console.error(err.message);
            cmd.outputHelp();
          } catch {
            /* best‑effort */
          }
        }
        return;
      }
      throw err;
    });
  } catch {
    /* best‑effort */
  }

  // Patch parse/parseAsync to normalize argv (idempotent).
  try {
    const holder = cmd as unknown as {
      parse: (argv?: readonly string[], opts?: FromOpt) => Command;
      parseAsync: (
        argv?: readonly string[],
        opts?: FromOpt,
      ) => Promise<Command>;
    };
    const origParse = holder.parse.bind(cmd);
    const origParseAsync = holder.parseAsync.bind(cmd);
    holder.parse = (argv?: readonly string[], opts?: FromOpt) => {
      origParse(normalizeArgv(argv as unknown[] | undefined), opts);
      return cmd;
    };
    holder.parseAsync = async (argv?: readonly string[], opts?: FromOpt) => {
      await origParseAsync(normalizeArgv(argv as unknown[] | undefined), opts);
      return cmd;
    };
  } catch {
    /* best‑effort */
  }
};
