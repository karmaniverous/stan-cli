/* src/stan/config/normalize.ts
 * Normalization helpers for config parsing and CLI defaults.
 */
import type { CliDefaults } from './types';

export const normalizeMaxUndos = (v: unknown): number => {
  const n =
    typeof v === 'number'
      ? Math.floor(v)
      : Number.isFinite(Number.parseInt(String(v), 10))
        ? Math.floor(Number.parseInt(String(v), 10))
        : NaN;
  if (!Number.isFinite(n) || n < 1) return 10;
  return n;
};

export const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length ? v : undefined;

export const asBool = (v: unknown): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  if (typeof v === 'number') {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  return undefined;
};

export const asStringArray = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => (typeof x === 'string' ? x : undefined))
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return out.length ? out : [];
};

const asInt = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s.length) return undefined;
    const n = Number.parseInt(s, 10);
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return undefined;
};
export const normalizeCliDefaults = (v: unknown): CliDefaults | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const runIn = (o.run ?? {}) as Record<string, unknown>;
  const patchIn = (o.patch ?? {}) as Record<string, unknown>;
  const snapIn = (o.snap ?? {}) as Record<string, unknown>;
  const out: CliDefaults = {};
  const dbg = asBool(o.debug);
  const bor = asBool(o.boring);
  if (typeof dbg === 'boolean') out.debug = dbg;
  if (typeof bor === 'boolean') out.boring = bor;
  const run: NonNullable<CliDefaults['run']> = {};
  const ra = asBool(runIn.archive);
  const rc = asBool(runIn.combine);
  const rk = asBool(runIn.keep);
  const rq = asBool(runIn.sequential);
  if (typeof ra === 'boolean') run.archive = ra;
  if (typeof rc === 'boolean') run.combine = rc;
  if (typeof rk === 'boolean') run.keep = rk;
  if (typeof rq === 'boolean') run.sequential = rq;
  const rPlan = asBool(runIn.plan);
  if (typeof rPlan === 'boolean') run.plan = rPlan;
  const rl = asBool(runIn.live);
  if (typeof rl === 'boolean') run.live = rl;
  const rWarn = asInt(runIn.hangWarn);
  if (typeof rWarn === 'number' && rWarn > 0) run.hangWarn = rWarn;
  const rKill = asInt(runIn.hangKill);
  if (typeof rKill === 'number' && rKill > 0) run.hangKill = rKill;
  const rGrace = asInt(runIn.hangKillGrace);
  if (typeof rGrace === 'number' && rGrace > 0) run.hangKillGrace = rGrace;
  if (typeof runIn.scripts === 'boolean') {
    run.scripts = runIn.scripts;
  } else {
    const arr = asStringArray(runIn.scripts);
    if (arr) run.scripts = arr;
  }
  if (Object.keys(run).length) out.run = run;
  const patch: NonNullable<CliDefaults['patch']> = {};
  const pf = asString(patchIn.file);
  if (pf !== undefined) patch.file = pf;
  if (Object.keys(patch).length) out.patch = patch;
  const snap: NonNullable<CliDefaults['snap']> = {};
  const st = asBool(snapIn.stash);
  if (typeof st === 'boolean') snap.stash = st;
  if (Object.keys(snap).length) out.snap = snap;
  return Object.keys(out).length ? out : undefined;
};
