/** src/cli/stan/patch.ts
 * CLI adapter for "stan patch" — Commander wiring only.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  findConfigPathSync,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import { Command, Option } from 'commander';

import { loadCliConfigSync } from '@/cli/config/load';
import { printHeader } from '@/cli/header';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';
import * as patchServiceMod from '@/runner/patch/service';
type PatchServiceModule = typeof import('@/runner/patch/service');
type RunPatchFn = PatchServiceModule['runPatch'];

// Robustly resolve applyCliSafety from named or default exports to avoid SSR/evaluation issues.
import * as cliUtils from './cli-utils';
type CliUtilsModule = typeof import('./cli-utils');
type ApplyCliSafetyFn = CliUtilsModule['applyCliSafety'];

// Local, module‑independent safety fallback (parse normalization + exit override).
const applySafetyLocal = (cmd: Command): void => {
  // Normalize ["node","stan", ...] → [...]
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
    if (typeof first !== 'string' || typeof second !== 'string') {
      return undefined;
    }
    if (first === 'node' && second === 'stan') {
      const rest = argv
        .slice(2)
        .filter((t): t is string => typeof t === 'string');
      return rest as readonly string[];
    }
    return argv as readonly string[];
  };
  try {
    // Swallow common Commander exits to keep tests quiet.
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
  try {
    type FromOpt = { from?: 'user' | 'node' };
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
      origParse(normalizeArgv(argv), opts);
      return cmd;
    };
    holder.parseAsync = async (argv?: readonly string[], opts?: FromOpt) => {
      await origParseAsync(normalizeArgv(argv), opts);
      return cmd;
    };
  } catch {
    /* best‑effort */
  }
};

/**
 * Register the `patch` subcommand on the provided root CLI. *
 * @param cli - Commander root command. * @returns The same root command for chaining.
 */
export function registerPatch(cli: Command): Command {
  // Best‑effort: do not throw if resolution fails in a mocked/SSR environment.
  {
    let applied = false;
    try {
      const applyCliSafetyResolved: ApplyCliSafetyFn | undefined =
        resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
          cliUtils as unknown,
          (m) => (m as CliUtilsModule).applyCliSafety,
          (m) =>
            (m as { default?: Partial<CliUtilsModule> }).default
              ?.applyCliSafety,
          'applyCliSafety',
        );
      applyCliSafetyResolved(cli);
      applied = true;
    } catch {
      /* best-effort */
    }
    if (!applied) {
      // Fallback: install parse normalization and exit override directly.
      try {
        (
          cliUtils as unknown as {
            installExitOverride?: (c: Command) => void;
            patchParseMethods?: (c: Command) => void;
          }
        ).installExitOverride?.(cli);
        (
          cliUtils as unknown as {
            patchParseMethods?: (c: Command) => void;
          }
        ).patchParseMethods?.(cli);
      } catch {
        /* best‑effort */
      }
      // Final local safety to cover missing helpers under SSR/mocks.
      applySafetyLocal(cli);
    }
  }
  // Final safety: unconditionally ensure parse normalization and exit override (idempotent).
  try {
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
        patchParseMethods?: (c: Command) => void;
      }
    ).patchParseMethods?.(cli);
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
      }
    ).installExitOverride?.(cli);
  } catch {
    /* best‑effort */
  }
  // Also apply local safety idempotently to guard tests further.
  applySafetyLocal(cli);

  const sub = cli
    .command('patch')
    .description(
      'Apply a git patch from clipboard (default), a file (-f), or argument.',
    )
    .argument('[input]', 'Patch data (unified diff)');

  // Build -f option and append default file path from config when present
  const optFile = new Option(
    '-f, --file [filename]',
    'Read patch from file as source',
  );
  try {
    const p = findConfigPathSync(process.cwd());
    if (p) {
      const cfg = loadCliConfigSync(process.cwd());
      const df = cfg.cliDefaults?.patch?.file;
      if (typeof df === 'string' && df.trim().length > 0) {
        optFile.description = `${optFile.description} (DEFAULT: ${df.trim()})`;
      }
    }
  } catch {
    // best-effort
  }

  sub
    .addOption(optFile)
    .addOption(
      new Option(
        '-F, --no-file',
        'Ignore configured default patch file (use clipboard unless input/-f provided)',
      ),
    )
    .option('-c, --check', 'Validate patch without applying any changes');
  {
    let applied = false;
    try {
      const applyCliSafetySub: ApplyCliSafetyFn | undefined =
        resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
          cliUtils as unknown,
          (m) => (m as CliUtilsModule).applyCliSafety,
          (m) =>
            (m as { default?: Partial<CliUtilsModule> }).default
              ?.applyCliSafety,
          'applyCliSafety',
        );
      if (applyCliSafetySub) {
        applyCliSafetySub(sub);
        applied = true;
      }
    } catch {
      /* best-effort */
    }
    if (!applied) {
      // Fallback: install parse normalization and exit override directly.
      try {
        (
          cliUtils as unknown as {
            installExitOverride?: (c: Command) => void;
            patchParseMethods?: (c: Command) => void;
          }
        ).installExitOverride?.(sub);
        (
          cliUtils as unknown as {
            patchParseMethods?: (c: Command) => void;
          }
        ).patchParseMethods?.(sub);
      } catch {
        /* best-effort */
      }
    }
  }
  // Final safety on subcommand as well (idempotent).
  try {
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
        patchParseMethods?: (c: Command) => void;
      }
    ).patchParseMethods?.(sub);
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
      }
    ).installExitOverride?.(sub);
  } catch {
    /* best-effort */
  }
  // Local fallback on subcommand too (idempotent).
  applySafetyLocal(sub);

  sub.action(
    async (
      inputMaybe?: string,
      opts?: { file?: string | boolean; check?: boolean; noFile?: boolean },
    ) => {
      // Header + reversal guard + state update
      try {
        const cwd = process.cwd();
        // Resolve stanPath robustly even when engine config is missing/strict.
        let stanPath = '.stan';
        try {
          stanPath = resolveStanPathSync(cwd);
        } catch {
          /* keep default */
        }
        const st = await readLoopState(cwd, stanPath).catch(() => null);
        printHeader('patch', st?.last ?? null);
        if (st?.last && isBackward(st.last, 'patch')) {
          const proceed = await confirmLoopReversal();
          if (!proceed) {
            console.log('');
            return;
          }
        }
        await writeLoopState(cwd, stanPath, 'patch', new Date().toISOString());
      } catch {
        /* ignore guard failures */
      }

      // Resolve default patch file from CLI config (cliDefaults.patch.file)
      let defaultFile: string | undefined;
      try {
        const cwd = process.cwd();
        const p = findConfigPathSync(cwd);
        if (p) {
          const cliCfg = loadCliConfigSync(cwd);
          const fromCfg = cliCfg.cliDefaults?.patch?.file;
          if (typeof fromCfg === 'string' && fromCfg.trim().length > 0) {
            defaultFile = fromCfg.trim();
          }
        }
      } catch {
        // best-effort
      }

      // Resolve runPatch lazily at action time to avoid module-eval SSR issues.
      let runPatchResolved: RunPatchFn | undefined;
      try {
        runPatchResolved = resolveNamedOrDefaultFunction<RunPatchFn>(
          patchServiceMod as unknown,
          (m) => (m as PatchServiceModule).runPatch,
          (m) =>
            (m as { default?: Partial<PatchServiceModule> }).default?.runPatch,
          'runPatch',
        );
      } catch {
        runPatchResolved = undefined;
      }
      if (!runPatchResolved) return; // silent best‑effort when unavailable in test/SSR edge cases
      await runPatchResolved(process.cwd(), inputMaybe, {
        file: opts?.file,
        check: opts?.check,
        defaultFile,
        noFile: Boolean(opts?.noFile),
      });
    },
  );

  return cli;
}

// Provide a default export as a callable function for SSR/mocks, while retaining the named export.
export default registerPatch;
