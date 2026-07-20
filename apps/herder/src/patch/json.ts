/* The patch JSON dialect — how a bench travels. The library, the
   clipboard and localStorage all speak it; everything read back is
   validated field by field, so a hostile or stale document degrades
   to nothing rather than a broken bench. */

import { setDial, type DialsSnap, type Slot, type SlotSnap } from '@ldlework/dials';
import { makeEdge, makeNode, SWITCH_INS, validConnection, type NodeKind, type Patch, type PatchEdge, type PatchNode, type SubPatch } from './graph';
import type { InstVals } from './library';
import { GLOBAL_PARAMS, PARAMS, globalSlots } from './params';
import { applySnapOverlay, treeToSnap } from './slots';
import { FX } from '../fx';

const KINDS: NodeKind[] = ['media', 'webcam', 'draw', 'camera', 'monitor', 'mixer', 'delay', 'switch', 'dial', 'xypad', 'in', 'out', 'module', ...(Object.keys(FX) as NodeKind[])];
const MAX_DEPTH = 16;

/** one level of graph as a plain JSON-able object — module patches
    nest recursively */
export function graphToJSON(g: SubPatch): { nodes: object[]; edges: object[] } {
  return {
    nodes: g.nodes.map(n => ({
      id: n.id, type: n.type, x: n.position.x, y: n.position.y,
      name: n.data.name, slots: treeToSnap(n.data.slots), sel: n.data.sel,
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
      /* the slot tree: a current save carries `slots: DialsSnap`
         (values AND modulation) hydrated over the fresh defaults; an old
         save carries `v: {k:num}` — migrate it by setting each slot's
         value. Either way setDial/fromJSON clamp to each slot's range, so
         a hostile field degrades rather than breaking the bench. */
      if (r.slots && typeof r.slots === 'object') {
        applySnapOverlay(n.data.slots, sanitizeSnap(r.slots, kind));
      } else if (r.v && typeof r.v === 'object') {
        for (const k of Object.keys(PARAMS[kind])) {
          const val = r.v[k];
          if (typeof val === 'number' && isFinite(val)) {
            setDial(n.data.slots[k] as Slot<number>, val);
          }
        }
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

/** keep only a snap's known param keys and coerce each slot level to
    JSON-legal shape (finite value; depth in [0,1]; mode/attached passed
    through for dials' fromJSON to validate). Unknown keys are dropped;
    the source registry check happens later via onMissingSource:'drop'. */
function sanitizeSnap(raw: Record<string, any>, kind: NodeKind): DialsSnap {
  const out: DialsSnap = {};
  for (const k of Object.keys(PARAMS[kind])) {
    const s = raw[k];
    if (s && typeof s === 'object') out[k] = sanitizeSlotSnap(s);
  }
  return out;
}

/** one slot level of a snap, sanitized recursively through its attached
    source's params — a stale/hostile field just falls away */
function sanitizeSlotSnap(s: Record<string, any>): SlotSnap {
  const out: SlotSnap = {
    value: typeof s.value === 'number' && isFinite(s.value) ? s.value : 0,
  };
  if (typeof s.depth === 'number' && isFinite(s.depth)) out.depth = Math.max(0, Math.min(1, s.depth));
  if (s.mode === 'center' || s.mode === 'up' || s.mode === 'down') out.mode = s.mode;
  if (s.attached && typeof s.attached === 'object' && typeof s.attached.name === 'string') {
    const params: Record<string, SlotSnap> = {};
    const ap = s.attached.params;
    if (ap && typeof ap === 'object')
      for (const [pk, pv] of Object.entries(ap))
        if (pv && typeof pv === 'object') params[pk] = sanitizeSlotSnap(pv as Record<string, any>);
    out.attached = { name: s.attached.name, params };
  }
  return out;
}

/** an instance's stored overlay, validated per rel key — `slots` is a
    sanitized DialsSnap (values + modulation), sel a rounded int, media a
    bool. A hostile or stale entry degrades to an empty overlay rather
    than a broken instance. The prototype's kind is unknown here (the rel
    key names a path, not a kind), so slot levels are sanitized
    structurally; compile hydrates them onto the real default tree, where
    unknown keys and missing sources fall away. */
function parseVals(d: Record<string, any>): Record<string, InstVals> {
  const out: Record<string, InstVals> = {};
  for (const [rel, raw] of Object.entries(d)) {
    if (!raw || typeof raw !== 'object') continue;
    const slots: DialsSnap = {};
    const src = raw.slots ?? migrateLegacyVals(raw.v);
    if (src && typeof src === 'object')
      for (const [k, s] of Object.entries(src))
        if (s && typeof s === 'object') slots[k] = sanitizeSlotSnap(s as Record<string, any>);
    const iv: InstVals = { slots };
    if (typeof raw.sel === 'number' && isFinite(raw.sel)) iv.sel = Math.max(0, Math.round(raw.sel));
    if (raw.media === true) iv.media = true;
    out[rel] = iv;
  }
  return out;
}

/** an old instance overlay stored `v: {k:num}`; lift it to snap levels */
function migrateLegacyVals(v: unknown): Record<string, SlotSnap> | null {
  if (!v || typeof v !== 'object') return null;
  const out: Record<string, SlotSnap> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>))
    if (typeof val === 'number' && isFinite(val)) out[k] = { value: val };
  return out;
}

/** the whole bench as JSON — the graph tree plus the globals. MIDI
    bindings travel separately (see the midi module) — they're keyed to
    node ids, which a paste or preset rebuild replaces wholesale. */
export function patchToJSON(p: Patch): object {
  return { v: 1, globals: treeToSnap(p.globals), ...graphToJSON({ nodes: p.nodes, edges: p.edges }) };
}

/** rebuild a whole bench from parsed JSON; null if it doesn't look
    like one. Globals hydrate a fresh slot tree — a current save carries
    `globals: DialsSnap`, an old one a `{k:num}` map (migrated per key). */
export function patchFromJSON(d: unknown): Patch | null {
  const g = graphFromJSON(d);
  if (!g) return null;
  const f = d as Record<string, any>;
  const globals = globalSlots();
  const raw = f.globals;
  if (raw && typeof raw === 'object') {
    const legacy = Object.values(raw).some(v => typeof v === 'number');
    if (legacy) {
      for (const k of Object.keys(GLOBAL_PARAMS)) {
        const val = raw[k];
        if (typeof val === 'number' && isFinite(val)) setDial(globals[k] as Slot<number>, val);
      }
    } else {
      applySnapOverlay(globals, sanitizeGlobalSnap(raw));
    }
  }
  return { ...g, globals };
}

/** a globals snap kept to its known keys and sanitized per level */
function sanitizeGlobalSnap(raw: Record<string, any>): DialsSnap {
  const out: DialsSnap = {};
  for (const k of Object.keys(GLOBAL_PARAMS)) {
    const s = raw[k];
    if (s && typeof s === 'object') out[k] = sanitizeSlotSnap(s);
  }
  return out;
}
