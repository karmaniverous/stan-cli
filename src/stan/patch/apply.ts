import { spawn } from 'node:child_process';

// Attempt/diagnostic types
export type ApplyAttempt = {
  args: string[];
  strip: number;
  label: string;
};

export type AttemptCapture = {
  label: string;
  code: number;
  stdout: string;
  stderr: string;
};

export type ApplyResult = {
  ok: boolean;
  tried: string[];
  lastCode: number;
  captures: AttemptCapture[];
};

export const buildApplyAttempts = (
  check: boolean,
  strip: number,
  stage: boolean,
): ApplyAttempt[] => {
  const base = check ? ['--check'] : stage ? ['--index'] : [];
  const with3WayNowarn: ApplyAttempt = {
    args: [
      ...base,
      '--3way',
      '--whitespace=nowarn',
      '--recount',
      '--inaccurate-eof',
      `-p${strip.toString()}`,
    ],
    strip,
    label: `3way+nowarn-p${strip.toString()}`,
  };
  const with3WayIgnore: ApplyAttempt = {
    args: [
      ...base,
      '--3way',
      '--ignore-whitespace',
      '--recount',
      '--inaccurate-eof',
      `-p${strip.toString()}`,
    ],
    strip,
    label: `3way+ignore-p${strip.toString()}`,
  };
  // 2-way (no --3way) variants per strip level
  const with2WayNowarn: ApplyAttempt = {
    args: [
      ...base,
      '--whitespace=nowarn',
      '--recount',
      '--inaccurate-eof',
      `-p${strip.toString()}`,
    ],
    strip,
    label: `2way+nowarn-p${strip.toString()}`,
  };
  const with2WayIgnore: ApplyAttempt = {
    args: [
      ...base,
      '--ignore-whitespace',
      '--recount',
      '--inaccurate-eof',
      `-p${strip.toString()}`,
    ],
    strip,
    label: `2way+ignore-p${strip.toString()}`,
  };
  // No “--reject” attempt — we do not emit or collect .rej files.
  return [with3WayNowarn, with3WayIgnore, with2WayNowarn, with2WayIgnore];
};

export const runGitApply = async (
  cwd: string,
  patchFileAbs: string,
  attempts: ApplyAttempt[],
  debug = process.env.STAN_DEBUG === '1',
): Promise<ApplyResult> => {
  const tried: string[] = [];
  const captures: AttemptCapture[] = [];

  for (const att of attempts) {
    tried.push(att.label);

    const code = await new Promise<number>((resolveP) => {
      const child = spawn('git', ['apply', ...att.args, patchFileAbs], {
        cwd,
        shell: false,
        windowsHide: true,
      });

      let so = '';
      let se = '';

      const cp = child as unknown as {
        stdout?: NodeJS.ReadableStream;
        stderr?: NodeJS.ReadableStream;
      };
      cp.stderr?.on('data', (d: Buffer) => {
        const s = d.toString('utf8');
        se += s;
        if (debug) process.stderr.write(s);
      });
      cp.stdout?.on('data', (d: Buffer) => {
        const s = d.toString('utf8');
        so += s;
        if (debug) process.stdout.write(s);
      });

      child.on('close', (c) => {
        captures.push({
          label: att.label,
          code: c ?? 0,
          stdout: so,
          stderr: se,
        });
        resolveP(c ?? 0);
      });
    });

    if (code === 0) {
      return { ok: true, tried, lastCode: 0, captures };
    }
    if (debug) {
      console.error(`stan: git apply failed for ${att.label} (exit ${code})`);
    }
  }
  return { ok: false, tried, lastCode: 1, captures };
};
