// src/stan/patch/format.ts
/**
 * Central formatter for patch failure outputs.
 * Unified for all repos:
 * - diff: identification line + diagnostics envelope (START/END).
 *         Attempts summary: one line per git attempt in cascade order:
 *           “<label>: exit <code>[ — \<first stderr line\>]”.
 *         Always append concise “jsdiff: <path>: <reason>” lines when jsdiff ran.
 * - file-ops: “The File Ops patch failed.” + diagnostics envelope containing
 *             parse/exec failures; no action‑request line.
 */

export type FailureContext = 'downstream' | 'stan';
export type FailureKind = 'diff' | 'file-ops';

export type JsReason = { path: string; reason: string };

export type DiffFailureInput = {
  context: FailureContext;
  kind: 'diff';
  targets: string[]; // header-derived or jsdiff failed paths
  // Legacy: last-attempt stderr (kept for back-compat when attempts[] not supplied)
  gitStderr?: string;
  // Optional full attempts capture (preferred)
  attempts?: Array<{
    label: string;
    code: number;
    stderr?: string;
  }>;
  // Js fallback reasons when jsdiff ran
  jsReasons?: JsReason[];
};
export type FileOpsFailureInput = {
  context: FailureContext;
  kind: 'file-ops';
  fileOpsBlock?: string; // downstream quoting
  fileOpsErrors?: string[]; // STAN: parser/exec failures (one per line)
};

export type FailureInput = DiffFailureInput | FileOpsFailureInput;

const NL = '\n';

import { renderAttemptSummary } from './diag/util';

const fmtStanDiff = (
  targets: string[],
  gitStderr?: string,
  js?: JsReason[],
  attempts?: DiffFailureInput['attempts'],
) => {
  const id =
    targets.length > 0
      ? `The unified diff patch for file ${targets[0]} was invalid.`
      : 'The unified diff patch was invalid.';

  let diag = '';
  if (attempts && attempts.length) {
    const attemptLines = renderAttemptSummary(attempts);
    const jsLines =
      js && js.length ? js.map((j) => `jsdiff: ${j.path}: ${j.reason}`) : [];
    diag = [...attemptLines, ...jsLines].join(NL);
  } else {
    // Back‑compat path (no attempts[] provided): include gitStderr (when present)
    // and always include js reasons when available.
    const parts: string[] = [];
    if (gitStderr && gitStderr.length) parts.push(gitStderr);
    if (js && js.length) {
      parts.push(...js.map((j) => `jsdiff: ${j.path}: ${j.reason}`));
    }
    diag = parts.join(NL);
  }

  return [
    id,
    '',
    'START PATCH DIAGNOSTICS',
    diag ?? '',
    'END PATCH DIAGNOSTICS',
    '',
  ].join(NL);
};

const fmtStanFileOps = (errors?: string[]): string => {
  return [
    'The File Ops patch failed.',
    '',
    'START PATCH DIAGNOSTICS',
    ...(errors && errors.length ? errors : ['']),
    'END PATCH DIAGNOSTICS',
    '',
  ].join(NL);
};

export const formatPatchFailure = (inp: FailureInput): string => {
  if (inp.kind === 'diff') {
    // Unified envelope for both downstream and STAN contexts
    return fmtStanDiff(inp.targets, inp.gitStderr, inp.jsReasons, inp.attempts);
  }
  // file-ops
  // Unified envelope for both downstream and STAN contexts
  return fmtStanFileOps(inp.fileOpsErrors);
};
