/* The patch JSON dialect — how a bench travels. The library, the
   clipboard and localStorage all speak it; everything read back is
   validated field by field, so a hostile or stale document degrades
   to nothing rather than a broken bench. */

import { makeEdge, makeNode, SWITCH_INS, validConnection, type NodeKind, type Patch, type PatchEdge, type PatchNode, type SubPatch } from './graph';
import type { InstVals } from './library';
import { GLOBAL_PARAMS, PARAMS } from './params';

const KINDS: NodeKind[] = ['media', 'draw', 'camera', 'monitor', 'mixer', 'switch', 'dial', 'xypad', 'in', 'out', 'module'];
const MAX_DEPTH = 16;

/** one level of graph as a plain JSON-able object — module patches
    nest recursively */
export function graphToJSON(g: SubPatch): { nodes: object[]; edges: object[] } {
  return {
    nodes: g.nodes.map(n => ({
      id: n.id, type: n.type, x: n.position.x, y: n.position.y,
      name: n.data.name, v: n.data.v, sel: n.data.sel,
      momentary: n.data.momentary, open: n.data.open,
      ...(n.data.flavor ? { flavor: n.data.flavor } : {}),
      /* post-migration every module is a reference — `patch` is no longer
         emitted. graphFromJSON still PARSES an embedded `patch` (an old
         save), so the boot migrator has the old shape to fold in. */
      ...(n.data.ref ? { ref: n.data.ref } : {}),
      ...(n.data.vals && Object.keys(n.data.vals).length ? { vals: n.data.vals } : {}),
      ...(n.data.ports?.length ? { ports: n.data.ports } : {}),
      ...(n.data.labels === false ? { labels: false } : {}),
    })),
    edges: g.edges.map(e => ({ source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
  };
}

/** rebuild one level of graph from parsed JSON, validated field by
    field, recursing into module patches; null if it doesn't look like
    one (or nests deeper than any honest patch) */
export function graphFromJSON(d: unknown, depth = 0): SubPatch | null {
  try {
    if (depth > MAX_DEPTH || !d || typeof d !== 'object') return null;
    const f = d as Record<string, any>;
    if (!Array.isArray(f.nodes) || !Array.isArray(f.edges)) return null;
    const nodes: PatchNode[] = [];
    for (const r of f.nodes) {
      const kind = KINDS.includes(r.type) ? r.type as NodeKind : null;
      if (!kind || typeof r.id !== 'string') continue;
      const n = makeNode(kind, Number(r.x) || 0, Number(r.y) || 0, [], {
        momentary: r.momentary === true,
        flavor: r.flavor === 'c' ? 'c' : 'v',
      });
      n.id = r.id;
      if (typeof r.name === 'string') n.data.name = r.name;
      n.data.sel = Math.max(0, Math.min(SWITCH_INS - 1, Math.round(Number(r.sel) || 0)));
      n.data.open = r.open === true;
      if (Array.isArray(r.ports)) n.data.ports = r.ports.filter((k: unknown): k is string => typeof k === 'string' && k in PARAMS[kind]);
      n.data.labels = r.labels !== false;
      if (kind === 'module') {
        /* a by-reference instance carries a ref + its own values. An old
           embedded save still PARSES its nested `patch` — the boot migrator
           reads it to mint an entry, after which the field is gone. A
           module with neither ref nor patch is malformed and renders dead. */
        if (typeof r.ref === 'string') n.data.ref = r.ref;
        if (r.vals && typeof r.vals === 'object') n.data.vals = parseVals(r.vals);
        if (r.patch) n.data.patch = graphFromJSON(r.patch, depth + 1) ?? { nodes: [], edges: [] };
      }
      for (const [k, p] of Object.entries(PARAMS[kind])) {
        const val = r.v?.[k];
        if (typeof val === 'number' && isFinite(val)) n.data.v[k] = Math.min(p.max, Math.max(p.min, val));
      }
      nodes.push(n);
    }
    const ids = new Set(nodes.map(n => n.id));
    const edges: PatchEdge[] = [];
    for (const r of f.edges) {
      if (!ids.has(r.source) || !ids.has(r.target)) continue;
      if (!validConnection(r.sourceHandle, r.targetHandle)) continue;
      edges.push(makeEdge(r.source, r.sourceHandle, r.target, r.targetHandle));
    }
    return { nodes, edges };
  } catch {
    return null;
  }
}

/** an instance's stored values, validated per rel key — v is a
    finite-number map, sel a rounded int, media a bool. A hostile or
    stale entry degrades to an empty v rather than a broken instance. */
function parseVals(d: Record<string, any>): Record<string, InstVals> {
  const out: Record<string, InstVals> = {};
  for (const [rel, raw] of Object.entries(d)) {
    if (!raw || typeof raw !== 'object') continue;
    const v: Record<string, number> = {};
    if (raw.v && typeof raw.v === 'object')
      for (const [k, val] of Object.entries(raw.v))
        if (typeof val === 'number' && isFinite(val)) v[k] = val;
    const iv: InstVals = { v };
    if (typeof raw.sel === 'number' && isFinite(raw.sel)) iv.sel = Math.max(0, Math.round(raw.sel));
    if (raw.media === true) iv.media = true;
    out[rel] = iv;
  }
  return out;
}

/** the whole bench as JSON — the graph tree plus the globals. MIDI
    bindings travel separately (see the midi module) — they're keyed to
    node ids, which a paste or preset rebuild replaces wholesale. */
export function patchToJSON(p: Patch): object {
  return { v: 1, globals: p.globals, ...graphToJSON({ nodes: p.nodes, edges: p.edges }) };
}

/** rebuild a whole bench from parsed JSON; null if it doesn't look
    like one */
export function patchFromJSON(d: unknown): Patch | null {
  const g = graphFromJSON(d);
  if (!g) return null;
  const f = d as Record<string, any>;
  const globals = Object.fromEntries(Object.entries(GLOBAL_PARAMS).map(([k, p]) => {
    const val = f.globals?.[k];
    return [k, typeof val === 'number' && isFinite(val) ? Math.min(p.max, Math.max(p.min, val)) : p.def];
  }));
  return { ...g, globals };
}
