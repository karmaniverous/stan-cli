// src/stan/patch/diagnostics.ts
import type { TargetInfo } from '@/stan/patch/diff';
import { parseFirstTarget } from '@/stan/patch/diff';

const listFiles = (files: TargetInfo[]): string[] => {
  const kind = (k: TargetInfo['kind']): string =>
    k === 'created' ? 'created' : k === 'deleted' ? 'deleted' : 'modified';
  return files.map((f) => `- ${f.path} (${kind(f.kind)})`);
};

export const composeInvalidFileOpsWithDiffEnvelope = (
  ops: Array<{ verb: string; src?: string; dest?: string }>,
  files: TargetInfo[],
): string => {
  const lines: string[] = [];
  lines.push('START PATCH DIAGNOSTICS');
  lines.push('Type: file-ops+diff (invalid)');
  lines.push(`Targets (ops ${ops.length.toString()}):`);
  for (const o of ops) {
    if (o.verb === 'mv') lines.push(`- mv ${o.src ?? ''} ${o.dest ?? ''}`);
    else if (o.verb === 'rm') lines.push(`- rm ${o.src ?? ''}`);
    else if (o.verb === 'rmdir') lines.push(`- rmdir ${o.src ?? ''}`);
    else if (o.verb === 'mkdirp') lines.push(`- mkdirp ${o.src ?? ''}`);
    else lines.push(`- ${o.verb}`);
  }
  lines.push(`Diff files (found ${files.length.toString()}):`);
  lines.push(...listFiles(files));
  lines.push('END PATCH DIAGNOSTICS');
  return lines.join('\n');
};

export const composeMultiFileInvalidEnvelope = (
  files: TargetInfo[],
): string => {
  const lines: string[] = [];
  lines.push('START PATCH DIAGNOSTICS');
  lines.push('Type: diff-multi-file (invalid)');
  lines.push(`Diff files (found ${files.length.toString()}):`);
  lines.push(...listFiles(files));
  lines.push('END PATCH DIAGNOSTICS');
  return lines.join('\n');
};

export const composeFileOpsFailuresEnvelope = (
  ops: Array<{ verb: string; src?: string; dest?: string }>,
  results: Array<{
    verb: string;
    src?: string;
    dest?: string;
    status: 'ok' | 'failed';
    errno?: string;
    message?: string;
  }>,
): string => {
  const lines: string[] = [];
  lines.push('START PATCH DIAGNOSTICS');
  lines.push('Type: file-ops');
  lines.push(`Targets (ops ${ops.length.toString()}):`);
  for (const o of ops) {
    if (o.verb === 'mv') lines.push(`- mv ${o.src ?? ''} ${o.dest ?? ''}`);
    else if (o.verb === 'rm') lines.push(`- rm ${o.src ?? ''}`);
    else if (o.verb === 'rmdir') lines.push(`- rmdir ${o.src ?? ''}`);
    else if (o.verb === 'mkdirp') lines.push(`- mkdirp ${o.src ?? ''}`);
    else lines.push(`- ${o.verb}`);
  }
  lines.push('Failures:');
  for (const r of results) {
    if (r.status === 'failed') {
      const tgt =
        r.verb === 'mv' ? `${r.src ?? ''} ${r.dest ?? ''}` : `${r.src ?? ''}`;
      const extra =
        r.errno || r.message
          ? ` — ${r.errno ?? ''} ${r.message ?? ''}`.trim()
          : '';
      lines.push(`- ${r.verb} ${tgt}${extra ? ` (${extra})` : ''}`);
    }
  }
  lines.push('END PATCH DIAGNOSTICS');
  return lines.join('\n');
};

export const composeDiffFailureEnvelope = (
  cleaned: string,
  out: {
    result?: {
      captures?: Array<{ label?: string; code?: number; stderr?: string }>;
    };
    js?: { failed?: Array<{ path?: string; reason?: string }> };
  },
): string => {
  const lines: string[] = [];
  lines.push('START PATCH DIAGNOSTICS');
  // Declaratively identify the target file when detectable from the patch head.
  try {
    const target = parseFirstTarget(cleaned);
    if (target) lines.push(`file: ${target}`);
  } catch {
    /* best-effort */
  }
  const caps = out?.result?.captures ?? [];
  for (const c of caps) {
    const first =
      (c.stderr ?? '').split(/\r?\n/).find((l) => l.trim().length) ?? '';
    lines.push(`${c.label ?? 'git'}: exit ${c.code ?? 0} — ${first}`);
  }
  for (const f of out?.js?.failed ?? []) {
    lines.push(`jsdiff: ${f.path ?? '(unknown)'}: ${f.reason ?? ''}`);
  }
  lines.push('END PATCH DIAGNOSTICS');
  return lines.join('\n');
};
