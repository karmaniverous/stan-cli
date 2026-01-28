/**
 * Compute a dependency selection closure from compact dependency meta (v2) and
 * dependency state (v2). This produces node IDs (graph keys), suitable for
 * filtering the host-private dependency map before staging external payloads.
 * @module
 */

const toPosix = (p: string): string => p.replace(/\\+/g, '/');

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object';

type MetaNodeV2 = {
  e?: Array<[string, number] | [string, number, number]>;
};

type DependencyMetaV2 = {
  v: 2;
  n: Record<string, MetaNodeV2>;
};

type StateEntryV2 = string | [string, number] | [string, number, number];

type DependencyStateV2 = {
  v: 2;
  i: StateEntryV2[];
  x?: StateEntryV2[];
};

const parseMetaV2 = (metaUnknown: unknown): DependencyMetaV2 => {
  if (!isObj(metaUnknown))
    throw new Error('invalid dependency meta (not an object)');
  const v = (metaUnknown as { v?: unknown }).v;
  const n = (metaUnknown as { n?: unknown }).n;
  if (v !== 2) throw new Error('invalid dependency meta (unsupported version)');
  if (!isObj(n)) throw new Error('invalid dependency meta (missing nodes)');
  const nodes: Record<string, MetaNodeV2> = {};
  for (const [k, rawNode] of Object.entries(n)) {
    const id = toPosix(k);
    if (!id) continue;
    if (!isObj(rawNode)) {
      nodes[id] = {};
      continue;
    }
    const e = (rawNode as { e?: unknown }).e;
    if (!Array.isArray(e)) {
      nodes[id] = {};
      continue;
    }
    const edges: Array<[string, number] | [string, number, number]> = [];
    for (const tup of e) {
      if (!Array.isArray(tup)) continue;
      const [t0, k0, r0] = tup as unknown[];
      if (typeof t0 !== 'string') continue;
      if (typeof k0 !== 'number' || !Number.isFinite(k0)) continue;
      const target = toPosix(t0);
      if (!target) continue;
      if (typeof r0 === 'number' && Number.isFinite(r0)) {
        edges.push([target, k0, r0]);
      } else {
        edges.push([target, k0]);
      }
    }
    nodes[id] = edges.length ? { e: edges } : {};
  }
  return { v: 2, n: nodes };
};

const parseStateV2 = (stateUnknown: unknown): DependencyStateV2 => {
  if (!isObj(stateUnknown))
    throw new Error('invalid dependency state (not an object)');
  const v = (stateUnknown as { v?: unknown }).v;
  const i = (stateUnknown as { i?: unknown }).i;
  const x = (stateUnknown as { x?: unknown }).x;
  if (v !== 2)
    throw new Error('invalid dependency state (unsupported version)');
  if (!Array.isArray(i))
    throw new Error('invalid dependency state (missing includes)');
  const normalizeEntries = (arr: unknown[]): StateEntryV2[] => {
    const out: StateEntryV2[] = [];
    for (const ent of arr) {
      if (typeof ent === 'string') {
        const id = toPosix(ent);
        if (id) out.push(id);
        continue;
      }
      if (Array.isArray(ent)) {
        const [id0, depth0, mask0] = ent as unknown[];
        if (typeof id0 !== 'string') continue;
        const id = toPosix(id0);
        if (!id) continue;
        const depth =
          typeof depth0 === 'number' && Number.isFinite(depth0) && depth0 >= 0
            ? Math.floor(depth0)
            : 0;
        const mask =
          typeof mask0 === 'number' && Number.isFinite(mask0) && mask0 > 0
            ? Math.floor(mask0)
            : 7;
        out.push(
          mask0 === undefined
            ? ([id, depth] as [string, number])
            : ([id, depth, mask] as [string, number, number]),
        );
      }
    }
    return out;
  };
  return {
    v: 2,
    i: normalizeEntries(i),
    x: Array.isArray(x) ? normalizeEntries(x) : undefined,
  };
};

const entryToSeed = (
  e: StateEntryV2,
): { id: string; depth: number; kindMask: number } => {
  if (typeof e === 'string') return { id: e, depth: 0, kindMask: 7 };
  const [id, depth0, mask0] = e;
  const depth =
    typeof depth0 === 'number' && Number.isFinite(depth0) && depth0 >= 0
      ? Math.floor(depth0)
      : 0;
  const kindMask =
    typeof mask0 === 'number' && Number.isFinite(mask0) && mask0 > 0
      ? Math.floor(mask0)
      : 7;
  return { id, depth, kindMask };
};

const expand = (meta: DependencyMetaV2, seeds: StateEntryV2[]): Set<string> => {
  const out = new Set<string>();
  const seen = new Set<string>();
  type Q = { id: string; depthLeft: number; kindMask: number };
  const q: Q[] = seeds.map((s) => {
    const seed = entryToSeed(s);
    return { id: seed.id, depthLeft: seed.depth, kindMask: seed.kindMask };
  });
  while (q.length) {
    const cur = q.shift();
    if (!cur) break;
    const id = toPosix(cur.id);
    if (!id) continue;
    const key = `${id}|${cur.depthLeft.toString()}|${cur.kindMask.toString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.add(id);
    if (cur.depthLeft <= 0) continue;
    const node = meta.n[id];
    const edges = node.e ?? [];
    for (const tup of edges) {
      const [t, edgeKindMask] = tup;
      if ((edgeKindMask & cur.kindMask) === 0) continue;
      q.push({ id: t, depthLeft: cur.depthLeft - 1, kindMask: cur.kindMask });
    }
  }
  return out;
};

/**
 * Compute selected node IDs (closure) for dependency context selection.
 *
 * @param metaUnknown - Parsed `dependency.meta.json` (v2 compact).
 * @param stateUnknown - Parsed `dependency.state.json` (v2).
 * @returns Sorted list of selected node IDs (POSIX paths).
 */
export const computeSelectedNodeIdsFromMetaAndState = (
  metaUnknown: unknown,
  stateUnknown: unknown,
): string[] => {
  const meta = parseMetaV2(metaUnknown);
  const state = parseStateV2(stateUnknown);
  const inc = expand(meta, state.i);
  const exc = state.x ? expand(meta, state.x) : new Set<string>();
  for (const x of exc) inc.delete(x);
  return Array.from(inc).sort((a, b) => a.localeCompare(b));
};
