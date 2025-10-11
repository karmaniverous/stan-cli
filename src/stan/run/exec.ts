// src/stan/run/exec.ts
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import treeKill from 'tree-kill';

import type { ProcessSupervisor } from './live/supervisor';
import type { ExecutionMode, Selection } from './types';

/** Compute nearest-first chain of node_modules/.bin directories up to filesystem root. */
const computeBinPathChain = (repoRoot: string): string[] => {
  const bins: string[] = [];
  let cur = repoRoot;
  for (;;) {
    const bin = join(cur, 'node_modules', '.bin');
    try {
      if (existsSync(bin)) bins.push(bin);
    } catch {
      /* ignore */
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return bins;
};

type RunHooks = {
  onStart?: (key: string) => void;
  onEnd?: (
    key: string,
    outFileAbs: string,
    startedAt: number,
    endedAt: number,
    exitCode: number,
    status?: 'ok' | 'warn' | 'error',
  ) => void;
  /** When true, suppress per-script console logs ("stan: start/done"). */
  silent?: boolean;
  /** Called when a script exceeds hangWarn inactivity (seconds). */
  onHangWarn?: (key: string, seconds: number) => void;
  /** Called when a script exceeds hangKill inactivity (seconds) and is being terminated. */
  onHangTimeout?: (key: string, seconds: number) => void;
  /** Called when a script did not exit after grace and was SIGKILLed. */
  onHangKilled?: (key: string, graceSeconds: number) => void;
};

// Yield one event-loop tick so pending signal/key handlers (e.g., SIGINT)
// can run before scheduling the next script.
const yieldToEventLoop = (): Promise<void> =>
  new Promise<void>((resolveP) => setImmediate(resolveP));

const waitForStreamClose = (stream: NodeJS.WritableStream): Promise<void> =>
  new Promise<void>((resolveP, rejectP) => {
    stream.on('close', () => resolveP());
    stream.on('error', (e) =>
      rejectP(e instanceof Error ? e : new Error(String(e))),
    );
  });

const configOrder = (config: ContextConfig): string[] =>
  Object.keys(config.scripts);

/**
 * Normalize selection to config order.
 * - When selection is null/undefined, return all config keys.
 * - When selection exists:
 *   - [] =\> run nothing
 *   - non-empty =\> order by config order
 */
export const normalizeSelection = (
  selection: Selection | undefined | null,
  config: ContextConfig,
): string[] => {
  const all = configOrder(config);
  if (!selection) return all;
  if (selection.length === 0) return [];
  const requested = new Set(selection);
  return all.filter((k) => requested.has(k));
};

/**
 * Run a single configured script and write its combined stdout/stderr to
 * `outRel/<key>.txt`.
 *
 * @param cwd - Working directory for the child process.
 * @param outAbs - Absolute output directory.
 * @param outRel - Relative output directory (for logs).
 * @param key - Script key (for logs and filename).
 * @param cmd - Shell command to execute.
 * @param orderFile - Optional order file to append a single letter marker.
 * @param hooks - Optional lifecycle hooks and flags.
 * @param opts - Optional execution options (e.g., silent logging).
 * @param supervisor - Optional process supervisor to track/terminate children.
 * @returns Absolute path to the generated output file.
 */
export const runOne = async (
  cwd: string,
  outAbs: string,
  outRel: string,
  key: string,
  cmd: string,
  orderFile?: string,
  hooks?: RunHooks,
  opts?: {
    silent?: boolean;
    hangWarn?: number;
    hangKill?: number;
    hangKillGrace?: number;
    /** Optional warn regexes compiled from config; any match across output+error (exit=0) =\> warn. */
    warnPatterns?: RegExp[];
  },
  supervisor?: ProcessSupervisor,
): Promise<string> => {
  const outFile = resolve(outAbs, `${key}.txt`);
  const startedAt = Date.now();
  hooks?.onStart?.(key);
  // Build child environment with PATH prefixed by repo/local node_modules/.bin (nearest-first).
  const parentEnv = process.env as Record<string, string | undefined>;
  const origPath =
    parentEnv.PATH ?? (parentEnv as unknown as { Path?: string }).Path ?? '';
  const binChain = computeBinPathChain(cwd);
  const childEnv = {
    ...parentEnv,
    PATH: [...binChain, origPath].filter(Boolean).join(delimiter),
  } as NodeJS.ProcessEnv;
  const child = spawn(cmd, {
    cwd,
    shell: true,
    windowsHide: true,
    env: childEnv,
  });

  const debug = process.env.STAN_DEBUG === '1';
  let combined = '';
  // Inactivity tracking for hang detection
  const hangWarnSec =
    typeof opts?.hangWarn === 'number' && opts.hangWarn > 0 ? opts.hangWarn : 0;
  const hangKillSec =
    typeof opts?.hangKill === 'number' && opts.hangKill > 0 ? opts.hangKill : 0;
  const hangGraceSec =
    typeof opts?.hangKillGrace === 'number' && opts.hangKillGrace > 0
      ? opts.hangKillGrace
      : 10;
  let lastActivity = Date.now();
  let warned = false;
  let terminated = false;
  let interval: NodeJS.Timeout | undefined;
  let killTimer: NodeJS.Timeout | undefined;

  try {
    // Track PID for cancellation/kill escalation
    if (typeof child.pid === 'number' && supervisor)
      supervisor.track(`script:${key}`, child.pid);
  } catch {
    /* ignore */
  }
  const stream = createWriteStream(outFile, { encoding: 'utf8' });
  child.stdout.on('data', (d: Buffer) => {
    stream.write(d);
    combined += d.toString('utf8');
    if (debug) process.stdout.write(d);
    lastActivity = Date.now();
  });
  child.stderr.on('data', (d: Buffer) => {
    stream.write(d);
    combined += d.toString('utf8');
    if (debug) process.stderr.write(d);
    lastActivity = Date.now();
  });

  // Periodic inactivity checks
  if (hangWarnSec > 0 || hangKillSec > 0) {
    interval = setInterval(() => {
      const now = Date.now();
      const inactiveMs = now - lastActivity;
      if (!warned && hangWarnSec > 0 && inactiveMs >= hangWarnSec * 1000) {
        warned = true;
        hooks?.onHangWarn?.(key, hangWarnSec);
      }
      if (!terminated && hangKillSec > 0 && inactiveMs >= hangKillSec * 1000) {
        terminated = true;
        try {
          if (typeof child.pid === 'number') process.kill(child.pid, 'SIGTERM');
        } catch {
          // best-effort
        }
        hooks?.onHangTimeout?.(key, hangKillSec);
        // escalate to SIGKILL after grace
        const graceMs = Math.max(0, hangGraceSec * 1000);
        killTimer = setTimeout(() => {
          try {
            if (typeof child.pid === 'number') treeKill(child.pid, 'SIGKILL');
          } catch {
            // ignore
          }
          hooks?.onHangKilled?.(key, hangGraceSec);
        }, graceMs);
      }
    }, 1000);
  }

  const exitCode = await new Promise<number>((resolveP, rejectP) => {
    child.on('error', (e) =>
      rejectP(e instanceof Error ? e : new Error(String(e))),
    );
    child.on('close', (code) => resolveP(code ?? 0));
  });
  if (interval) clearInterval(interval);
  if (killTimer) clearTimeout(killTimer);
  stream.end();
  await waitForStreamClose(stream);

  // Compute status: error > warn > ok
  let status: 'ok' | 'warn' | 'error' = 'ok';
  if (typeof exitCode === 'number' && exitCode !== 0) {
    status = 'error';
  } else if (opts?.warnPatterns && opts.warnPatterns.length > 0) {
    // Robust WARN detection (any-of across patterns and sources):
    // - Test all compiled variants against the in‑memory combined body.
    // - Also test the persisted output body to avoid rare flush/order edges.
    const anyMatch = (rxs: RegExp[], s: string): boolean =>
      rxs.some((r) => {
        try {
          r.lastIndex = 0;
          return r.test(s);
        } catch {
          return false;
        }
      });
    let matched = false;
    if (combined.length > 0 && anyMatch(opts.warnPatterns, combined)) {
      matched = true;
    } else {
      try {
        const diskBody = await readFile(outFile, 'utf8');
        if (anyMatch(opts.warnPatterns, diskBody)) matched = true;
      } catch {
        /* ignore disk read errors */
      }
    }
    if (matched) status = 'warn';
  }
  hooks?.onEnd?.(key, outFile, startedAt, Date.now(), exitCode, status);

  if (orderFile) {
    await appendFile(orderFile, key.slice(0, 1).toUpperCase(), 'utf8');
  }
  return outFile;
};
/**
 * Run a set of scripts concurrently or sequentially.
 * * @param cwd - Working directory for child processes.
 * @param outAbs - Absolute output directory.
 * @param outRel - Relative output directory (for logs).
 * @param config - Resolved configuration.
 * @param toRun - Keys to run (must be present in config).
 * @param mode - Execution mode.
 * @param orderFile - Optional order file path (when present, records execution order).
 * @returns Absolute paths to generated output files.
 * @param opts - Optional execution options (e.g., silent logging).
 * @param shouldContinue - Optional gate to stop scheduling new scripts when false (sequential mode).
 * @param supervisor - Optional process supervisor for child tracking/termination.
 */
export const runScripts = async (
  cwd: string,
  outAbs: string,
  outRel: string,
  config: ContextConfig,
  toRun: string[],
  mode: ExecutionMode,
  orderFile?: string,
  hooks?: RunHooks,
  opts?: { silent?: boolean },
  shouldContinue?: () => boolean,
  supervisor?: ProcessSupervisor,
): Promise<string[]> => {
  const created: string[] = [];
  const runner = async (k: string): Promise<void> => {
    // Pre-spawn cancellation gate (race closer):
    // It’s possible for a SIGINT to land after the outer gate but just before
    // this runner is invoked. Re-check here to ensure we never spawn the next
    // script once cancellation has been requested.
    try {
      if (typeof shouldContinue === 'function' && !shouldContinue()) {
        return;
      }
    } catch {
      /* best-effort */
    }
    // Normalize script entry (string | { script, warnPattern? })
    const entry = config.scripts[k] as unknown;
    const cmd =
      typeof entry === 'string'
        ? entry
        : typeof entry === 'object' &&
            entry &&
            'script' in (entry as Record<string, unknown>)
          ? String((entry as { script: string }).script)
          : '';
    // Compile warn pattern variants:
    // - as-is
    // - de-escaped backslashes (\\b -> \b)
    // - case-insensitive fallback
    const warnPatterns: RegExp[] = [];
    if (
      entry &&
      typeof entry === 'object' &&
      'warnPattern' in (entry as Record<string, unknown>)
    ) {
      const raw = (entry as { warnPattern?: string }).warnPattern;
      if (typeof raw === 'string' && raw.trim().length) {
        const src = raw.trim();
        // As-is
        try {
          warnPatterns.push(new RegExp(src));
        } catch {
          /* ignore */
        }
        // De-escaped
        try {
          const deEscaped = src.replace(/\\\\/g, '\\');
          if (deEscaped !== src) warnPatterns.push(new RegExp(deEscaped));
        } catch {
          /* ignore */
        }
        // Case-insensitive
        try {
          warnPatterns.push(new RegExp(src, 'i'));
        } catch {
          /* ignore */
        }
      }
    }
    const p = await runOne(
      cwd,
      outAbs,
      outRel,
      k,
      cmd,
      orderFile,
      hooks,
      // Pass thresholds down if provided
      {
        silent:
          typeof hooks?.silent === 'boolean'
            ? hooks.silent
            : Boolean(opts?.silent),
        hangWarn: (opts as unknown as { hangWarn?: number })?.hangWarn,
        hangKill: (opts as unknown as { hangKill?: number })?.hangKill,
        hangKillGrace: (opts as unknown as { hangKillGrace?: number })
          ?.hangKillGrace,
        warnPatterns,
      },
      supervisor,
    );
    created.push(p);
  };
  if (mode === 'sequential') {
    for (const k of toRun) {
      // Pre‑spawn gate: allow pending SIGINT/keypress handlers to fire before scheduling next script.
      // Also include a tiny guard window to absorb late-arriving SIGINT immediately after the prior script ends.
      const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      if (typeof shouldContinue === 'function') {
        if (!shouldContinue()) break;
        await yieldToEventLoop();
        if (!shouldContinue()) break;
        // Guard window (~25ms): mitigates race where SIGINT lands just after the yield above.
        await pause(25);
        if (!shouldContinue()) break;
      }
      await runner(k);
      // Allow pending SIGINT/keypress handlers to run before deciding on the next script,
      // then re-check the cancellation gate.
      if (typeof shouldContinue === 'function') {
        await yieldToEventLoop();
        if (!shouldContinue()) break;
      }
    }
  } else {
    const keys =
      typeof shouldContinue === 'function'
        ? toRun.filter(() => shouldContinue())
        : toRun;
    await Promise.all(keys.map((k) => runner(k).then(() => void 0)));
  }
  return created;
};
