import { spawn } from 'node:child_process';

export type RunResult = { code: number; stdout: string; stderr: string };

/**
 * Run a `git` command and capture its exit code, stdout, and stderr.
 *
 * Streams are buffered in memory; when `STAN_DEBUG=1`, output is mirrored
 * to the current process.
 *
 * @param cwd - Working directory for the git process.
 * @param args - Arguments to pass to `git`.
 * @returns `{ code, stdout, stderr }` from the completed process.
 */
export const runGit = async (cwd: string, args: string[]): Promise<RunResult> =>
  new Promise<RunResult>((resolve) => {
    const child = spawn('git', args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const cp = child as unknown as {
      stdout?: NodeJS.ReadableStream;
      stderr?: NodeJS.ReadableStream;
    };

    cp.stdout?.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      stdout += s;
      if (process.env.STAN_DEBUG === '1') process.stdout.write(s);
    });

    cp.stderr?.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      stderr += s;
      if (process.env.STAN_DEBUG === '1') process.stderr.write(s);
    });
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
