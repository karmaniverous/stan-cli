// src/stan/patch/diff.ts

export type TargetKind = 'created' | 'deleted' | 'modified';
export type TargetInfo = { path: string; kind: TargetKind };

export const parseFirstTarget = (cleaned: string): string | null => {
  const plus = cleaned.match(/^\+\+\+\s+b\/([^\r\n]+)$/m);
  if (plus && plus[1]) return plus[1].trim().replace(/\\/g, '/');
  const dg = cleaned.match(/^diff --git a\/([^\s]+)\s+b\/([^\s]+)$/m);
  if (dg && dg[2]) return dg[2].trim().replace(/\\/g, '/');
  return null;
};

export const collectPatchedTargets = (cleaned: string): TargetInfo[] => {
  const out: TargetInfo[] = [];
  const seen = new Set<string>();
  const lines = cleaned.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    // Prefer explicit +++ header when present
    let m = l.match(/^\+\+\+\s+([^\r\n]+)$/);
    if (m && m[1]) {
      const raw = m[1].trim();
      const kind: TargetKind = raw === '/dev/null' ? 'deleted' : 'modified'; // refine via --- header lookback if needed
      const p =
        raw === '/dev/null'
          ? '/dev/null'
          : raw.replace(/^b\//, '').replace(/^\.\//, '');
      if (p && !seen.has(p) && p !== '/dev/null') {
        seen.add(p);
        out.push({ path: p, kind });
      }
      continue;
    }
    // Fallback to diff --git headers
    m = l.match(/^diff --git a\/([^\s]+)\s+b\/([^\s]+)$/);
    if (m && m[2]) {
      const rawB = m[2].trim();
      const kind: TargetKind = rawB === '/dev/null' ? 'deleted' : 'modified';
      const p =
        rawB === '/dev/null'
          ? '/dev/null'
          : rawB.replace(/^b\//, '').replace(/^\.\//, '');
      if (p && !seen.has(p) && p !== '/dev/null') {
        seen.add(p);
        out.push({ path: p, kind });
      }
    }
  }
  // Improve created/deleted classification by scanning for /dev/null pairs
  // If +++ b/<path> and --- /dev/null => created; if +++ /dev/null => deleted (already filtered)
  const createdRe = /^---\s+\/dev\/null$/m;
  const createdB = /^\+\+\+\s+b\/([^\r\n]+)$/m;
  const createdMatch = cleaned.match(createdB);
  if (createdMatch && createdRe.test(cleaned)) {
    const p = createdMatch[1].trim().replace(/^b\//, '').replace(/^\.\//, '');
    const idx = out.findIndex((t) => t.path === p);
    if (idx >= 0) out[idx] = { path: p, kind: 'created' };
  }
  return out;
};

export const enforceSingleFileDiff = (
  cleaned: string,
): { ok: true; target: TargetInfo } | { ok: false; files: TargetInfo[] } => {
  const files = collectPatchedTargets(cleaned);
  return files.length === 1
    ? { ok: true, target: files[0] }
    : { ok: false, files };
};
