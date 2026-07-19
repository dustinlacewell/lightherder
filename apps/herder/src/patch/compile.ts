/* The flatten pass — what the engine actually runs.

   React Flow shows ONE level of the patch tree; the engine sees no
   modules at all. compile() expands every module instance into the
   flat graph: inner nodes keep their data objects (knob edits flow by
   reference) under instance-prefixed ids ("n12/n5", nesting
   recursively), and each boundary edge is rewired onto the IN/OUT
   device behind the module port it names. The engine rides through
   IN/OUT the way it rides through switches — pure routing, zero frame
   cost — so a module is acoustically transparent: boxing a patch
   never changes its laps.

   A by-reference module is where the structure and the values part
   ways. The structure comes from the library entry the module names
   (shared by every instance); the values are layered in from the frames
   the descent accumulates — the entry's own defaults at the bottom, an
   inner instance's stored inits above, and the outermost instance's
   vals on top (it wins). Because those merged nodes are shared prototype
   objects across every sibling instance, they MUST be emitted fresh —
   new node, new data, new v — every pass. That is the one place the
   tree↔mirror aliasing deliberately breaks; the writeParam router (in
   useOps) is its successor for reaching the engine same-tick. */

import { handleKind, type PatchEdge, type PatchNode, type SubPatch } from './graph';
import { adoptTreeState, applySnapOverlay, cloneTree } from './slots';
import type { EntryResolver, InstVals } from './library';

const MAX_DEPTH = 16;

/** one layer of instance values over a ref boundary: the compiled
    prefix the layer covers, the entry it entered (for the media default
    key), and the vals keyed by path relative to the prefix. Frames
    accumulate outermost-first as the descent enters each ref. */
interface Frame { base: string; entryId: string; vals: Record<string, InstVals> }

/** the library resolver every module reaches its patch through. In the
    transition, a module may still carry an embedded `patch` instead of
    a `ref` — the default resolver returns null so those fall through to
    the embedded branch, and an all-embedded bench compiles unchanged. */
export function compile(root: SubPatch, resolve: EntryResolver = () => null): SubPatch {
  const nodes: PatchNode[] = [];
  const edges: PatchEdge[] = [];
  expand('', root, nodes, edges, 0, resolve, [], new Set());
  return { nodes, edges };
}

/** adopt per-instance source state from the PREVIOUS compile's nodes
    wherever a compiled id survives with the same attachments — so a
    structural edit's recompile no longer restarts every module's
    modulation (an LFO keeps its phase, a filter its memory, the display
    its lastSample). Root nodes pass through compile by reference and
    skip out on identity; a departed or re-attached slot keeps its fresh
    clone. Callers that MEAN a fresh start (New / paste / a session
    join's rebuild) simply don't call this. */
export function adoptSources(prev: PatchNode[], next: PatchNode[]): void {
  const byId = new Map(prev.map(n => [n.id, n]));
  for (const n of next) {
    const p = byId.get(n.id);
    if (p && p !== n && p.data.slots !== n.data.slots) adoptTreeState(p.data.slots, n.data.slots);
  }
}

function expand(
  prefix: string, level: SubPatch, outN: PatchNode[], outE: PatchEdge[], depth: number,
  resolve: EntryResolver, frames: Frame[], active: Set<string>,
): void {
  if (depth > MAX_DEPTH) return;
  const modules = new Map<string, SubPatch>();
  const orphans = new Set<string>();   // ref modules whose entry is gone — edges touching them die
  for (const n of level.nodes) {
    if (n.type === 'module') {
      /* every module is a by-reference instance: resolve the entry, or
         orphan it. A cycle (the entry re-entering itself through the
         drill) is the same as a missing entry — emit nothing rather than
         loop. */
      const entry = n.data.ref !== undefined && !active.has(n.data.ref) ? resolve(n.data.ref) : null;
      if (!entry) { orphans.add(n.id); continue; }
      const base = prefix + n.id + '/';
      modules.set(n.id, entry);
      expand(base, entry, outN, outE, depth + 1, resolve,
        [...frames, { base, entryId: n.data.ref!, vals: n.data.vals ?? {} }], new Set(active).add(n.data.ref!));
    } else {
      outN.push(frames.length ? mergedNode(n, prefix, frames) : (prefix ? { ...n, id: prefix + n.id } : n));
    }
  }
  for (const e of level.edges) {
    /* an edge touching an orphaned ref module has nowhere to land —
       drop it, the same death a stale boundary port gives a wire */
    if (orphans.has(e.source) || orphans.has(e.target)) continue;
    let source = prefix + e.source;
    let sourceHandle = e.sourceHandle;
    let target = prefix + e.target;
    let targetHandle = e.targetHandle;
    const sm = modules.get(e.source);
    if (sm) {
      const port = boundary(sm, sourceHandle, 'out');
      if (!port) continue;                     // stale port — the wire dies at the boundary
      source = prefix + e.source + '/' + port.id;
      sourceHandle = port.handle;
    }
    const tm = modules.get(e.target);
    if (tm) {
      const port = boundary(tm, targetHandle, 'in');
      if (!port) continue;
      target = prefix + e.target + '/' + port.id;
      targetHandle = port.handle;
    }
    outE.push({ ...e, id: prefix + e.id, source, sourceHandle, target, targetHandle });
  }
}

/* a prototype node emitted under a ref boundary: a FRESH node with a
   FRESH data and v, its values merged from the frames — entry defaults
   first, then each instance layer, outermost winning. Media nodes are
   stamped with the blob key their picture rides under: the outermost
   instance's own copy when it replaced the file (the `media` marker),
   else the owning entry's default key. */
function mergedNode(n: PatchNode, prefix: string, frames: Frame[]): PatchNode {
  const compiledId = prefix + n.id;
  /* a FRESH slot tree per compiled instance: cloneTree re-instantiates
     every attached source, so two siblings never share stateful-source
     memory (an LFO's phase, a filter's state). This is the one place the
     tree↔mirror aliasing deliberately breaks — the value router in
     useOps is its successor for reaching the engine same-tick. */
  const data = { ...n.data, slots: cloneTree(n.data.slots) };
  /* frames are outermost-first; apply them innermost-first so the
     outermost instance's overlay lands last and wins. Each overlay is a
     DialsSnap hydrated onto the live clone (value + modulation). */
  for (let i = frames.length - 1; i >= 0; i--) {
    const iv = frames[i].vals[compiledId.slice(frames[i].base.length)];
    if (iv) {
      applySnapOverlay(data.slots, iv.slots);
      if (iv.sel !== undefined) data.sel = iv.sel;
    }
  }
  if (n.type === 'media') {
    /* did the OUTERMOST instance replace this file with its own copy?
       then the blob rides under the instance's compiled id. Otherwise
       the deepest entry owns the default: "lib.<id>/<pathWithinEntry>"
       (entry ids already begin "lib.", matching the stored keys). */
    const outer = frames[0];
    const outerIv = outer.vals[compiledId.slice(outer.base.length)];
    const deepest = frames[frames.length - 1];
    data.mediaKey = outerIv?.media
      ? compiledId
      : deepest.entryId + '/' + compiledId.slice(deepest.base.length);
  }
  return { ...n, id: compiledId, data };
}

/* resolve a module port handle ("v:n5") to the IN/OUT device behind
   it; null if the device is gone or its flavor no longer matches the
   wire. An IN's hidden input is "<kind>:in"; an OUT's hidden output is
   "<kind>:out" — the engine rides through both. */
function boundary(patch: SubPatch, portHandle: string, dir: 'in' | 'out'): { id: string; handle: string } | null {
  const kind = handleKind(portHandle);
  const id = portHandle.slice(2);
  const dev = patch.nodes.find(n => n.id === id && n.type === dir);
  if (!dev || (dev.data.flavor ?? 'v') !== kind) return null;
  return { id, handle: `${kind}:${dir === 'in' ? 'in' : 'out'}` };
}
