/* src/stan/run/exec/run-one.ts
 * Single-script execution (stdout/stderr capture, hang detection, status).
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import treeKill from 'tree-kill';

import { buildChildEnv } from '@/runner/run/exec/env';
import { waitForStreamClose } from '@/runner/run/exec/util';
import type { ProcessSupervisor } from '@/runner/run/live/supervisor';

export type RunHooks = {
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

/** Compile warn regex variants.
 * Default behavior (no flags provided):
 *  - as-is
 *  - \\-deescaped
 *  - case-insensitive (/i) convenience
 *
 * When flags are provided (warnPatternFlags), they override the default flags behavior:
 *  - compile as-is with provided flags
 *  - compile \\-deescaped with provided flags
 *  - do NOT add the implicit /i variant
 */
export const compileWarnPatterns = (
  raw?: string,
  flagsMaybe?: string,
): RegExp[] => {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const src = raw.trim();
  const out: RegExp[] = [];
  const useFlags = typeof flagsMaybe === 'string' && flagsMaybe.length > 0;
  const add = (pattern: string, flags?: string) => {
    try {
      out.push(new RegExp(pattern, flags));
    } catch {
      /* ignore invalid */
    }
  };

  if (useFlags) {
    add(src, flagsMaybe);
    const deEscaped = src.replace(/\\\\/g, '\\');
    if (deEscaped !== src) add(deEscaped, flagsMaybe);
  } else {
    add(src);
    const deEscaped = src.replace(/\\\\/g, '\\');
    if (deEscaped !== src) add(deEscaped);
    // Default convenience: case-insensitive
    add(src, 'i');
  }
  return out;
};

/** Execute a single script and write combined stdout/stderr to outAbs/<key>.txt. */
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
    warnPatterns?: RegExp[];
  },
  supervisor?: ProcessSupervisor,
): Promise<string> => {
  const outFile = resolve(outAbs, `${key}.txt`);
  const startedAt = Date.now();
  hooks?.onStart?.(key);

  // Create the output stream up front so the file exists even if the process
  // is cancelled before producing any output.
  const stream = createWriteStream(outFile, { encoding: 'utf8' });

  const child = spawn(cmd, {
    cwd,
    shell: true,
    windowsHide: true,
    env: buildChildEnv(cwd, process.env),
  });

  const debug = process.env.STAN_DEBUG === '1';
  let combined = '';
  // Hang detection thresholds
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
