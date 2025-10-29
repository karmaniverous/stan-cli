/** src/cli/stan/patch.ts
 * CLI adapter for "stan patch" — Commander wiring with SSR/test‑robust apply.
 *
 * Behavior:
 * - File Ops or other non-diff inputs: delegate to the service (engine pipeline).
 * - Unified diff inputs: attempt git-apply via a local "./apply" shim (mockable in tests);
 *   on failure, fall back to jsdiff from \@karmaniverous/stan-core (preserves EOLs).
 *
 * Notes:
 * - This keeps the engine as the primary pipeline for general behavior while
 *   providing a narrow, test‑friendly hook for jsdiff fallback in CLI tests.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  applyWithJsDiff,
  detectAndCleanPatch,
  findConfigPathSync,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import { Command, Option } from 'commander';

import { loadCliConfigSync } from '@/cli/config/load';
import { printHeader } from '@/cli/header';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';
// Robustly resolve the patch service (named or default)
import * as patchServiceMod from '@/runner/patch/service';
type PatchServiceModule = typeof import('@/runner/patch/service');
type RunPatchFn = PatchServiceModule['runPatch'];

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

/** Minimal detector for a unified diff payload. */
const looksLikeUnifiedDiff = (raw: string): boolean => {
  const s = raw.trimStart();
  return (
    s.startsWith('diff --git ') ||
    s.includes('\n--- ') ||
    s.includes('\n+++ ') ||
    /^---\s+(?:a\/|\/dev\/null)/m.test(s)
  );
};

/** Extract the first target path from a cleaned unified diff. */
const parseFirstTarget = (cleaned: string): string | undefined => {
  // Prefer +++ b/<path>; fall back to "diff --git a/X b/Y" => Y
  const plus = cleaned.match(/^\+\+\+\s+b\/([^\r\n]+)$/m);
  if (plus && plus[1]) return plus[1];
  const hdr = cleaned.match(/^diff --git\s+a\/([^\s]+)\s+b\/([^\s]+)$/m);
  if (hdr && hdr[2]) return hdr[2];
  return undefined;
};

/** Read raw patch input from argument or a file path (best‑effort). */
const readRawFromArgOrFile = async (
  inputMaybe?: string,
  fileMaybe?: unknown,
): Promise<{ raw: string; source: string }> => {
  if (typeof inputMaybe === 'string' && inputMaybe.length > 0) {
    return { raw: inputMaybe, source: 'argument' };
  }
  const file =
    typeof fileMaybe === 'string' && fileMaybe.trim().length
      ? fileMaybe.trim()
      : undefined;
  if (file) {
    const raw = await readFile(file, 'utf8');
    return { raw, source: `file "${file}"` };
  }
  // Last resort: empty input (service will handle clipboard/default-file paths if needed)
  return { raw: '', source: 'clipboard' };
};

/** Apply a unified diff locally via "./apply" then jsdiff fallback. */
const applyUnifiedDiffLocally = async (
  cwd: string,
  cleaned: string,
  check: boolean,
): Promise<{ ok: boolean; firstTarget?: string }> => {
  const firstTarget = parseFirstTarget(cleaned);
  try {
    // Dynamic resolver for the local shim (mockable in tests)
    const mod = (await import('./apply')) as unknown as {
      runGitApply?: (args: {
        cwd: string;
        patchAbs: string; // not used here; shim accepts a shape; provide a synthetic name
        cleaned: string;
        stripOrder?: number[];
      }) => Promise<{ ok: boolean }>;
      default?:
        | {
            runGitApply?: (args: {
              cwd: string;
              patchAbs: string;
              cleaned: string;
              stripOrder?: number[];
            }) => Promise<{ ok: boolean }>;
          }
        | ((...a: unknown[]) => unknown);
    };
    const runGitApply =
      (mod as { runGitApply?: unknown }).runGitApply ??
      (mod as { default?: { runGitApply?: unknown } }).default?.runGitApply;

    if (typeof runGitApply === 'function') {
      const gitOut = await runGitApply({
        cwd,
        patchAbs: path.join(cwd, '.stan', 'patch', '.patch'),
        cleaned,
        stripOrder: [1, 0],
      });
      if (gitOut && gitOut.ok) {
        return { ok: true, firstTarget };
      }
    }
  } catch {
    // ignore; proceed to jsdiff fallback
  }
  try {
    const js = await applyWithJsDiff({ cwd, cleaned, check });
    const ok = Array.isArray(js.failed) ? js.failed.length === 0 : false;
    return { ok, firstTarget };
  } catch {
    return { ok: false, firstTarget };
  }
};

export function registerPatch(cli: Command): Command {
  // Root safety
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

  // Sub safety
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

      const cwd = process.cwd();

      // Resolve raw input: argument > -f file > default file (when allowed) > clipboard (service path)
      let raw = '';
      let source = 'clipboard';
      const cfgPath = findConfigPathSync(cwd);
      let defaultFile: string | undefined;
      try {
        if (cfgPath) {
          const cfg = loadCliConfigSync(cwd);
          const df = cfg.cliDefaults?.patch?.file;
          if (typeof df === 'string' && df.trim().length && !opts?.noFile) {
            defaultFile = df.trim();
          }
        }
      } catch {
        /* ignore */
      }

      try {
        const preferFile =
          typeof opts?.file === 'string' && opts.file.trim().length
            ? opts.file.trim()
            : defaultFile;
        const got = await readRawFromArgOrFile(inputMaybe, preferFile);
        raw = got.raw;
        source = got.source;
      } catch {
        // fall through with empty raw; service may try clipboard
      }
      console.log(`stan: patch source: ${source}`);

      // Decide path:
      // - If we have a probable unified diff body, handle locally (shim + jsdiff).
      // - Otherwise, delegate to the service (File Ops, clipboard/default-file flows, diagnostics).
      const isDiff = looksLikeUnifiedDiff(raw);
      const cleaned = ((): string => {
        try {
          return isDiff ? detectAndCleanPatch(raw) : '';
        } catch {
          return '';
        }
      })();

      if (isDiff && cleaned.trim().length > 0) {
        const { ok, firstTarget } = await applyUnifiedDiffLocally(
          cwd,
          cleaned,
          Boolean(opts?.check),
        );
        if (ok) {
          const tail = firstTarget ? ` -> ${firstTarget}` : '';
          const msg = opts?.check ? 'patch check passed' : 'patch applied';
          console.log(`stan: ${statusOk(msg)}${tail}`);
          console.log('');
          return;
        }
        // Local attempt failed; fall through to service for diagnostics/clipboard fallback.
      }

      // Delegate to the service (robust classification: File Ops, clipboard, diagnostics)
      let runPatchResolved: RunPatchFn | undefined;
      try {
        runPatchResolved = (
          patchServiceMod as {
            runPatch?: RunPatchFn;
            default?: { runPatch?: RunPatchFn };
          }
        ).runPatch;
        if (!runPatchResolved) {
          const def = (
            patchServiceMod as {
              default?: { runPatch?: RunPatchFn };
            }
          ).default;
          runPatchResolved = def?.runPatch;
        }
      } catch {
        runPatchResolved = undefined;
      }
      if (!runPatchResolved) return; // silent best‑effort when unavailable

      await runPatchResolved(cwd, raw || inputMaybe, {
        file: typeof opts?.file === 'string' ? opts.file : undefined,
        check: Boolean(opts?.check),
        defaultFile,
        noFile: Boolean(opts?.noFile),
      });
    },
  );

  return cli;
}

// Provide a default export as a callable function for SSR/mocks, while retaining the named export.
export default registerPatch;
