/* The library as a definition store — the pure shape by-reference
   modules resolve against.

   A module instance in the document is nothing but a REFERENCE (an
   entry id) plus its own instance values. The structure — the nodes,
   the wires, the ports — lives once, in the library entry; every
   instance borrows it. Edit the entry and every instance of it, on
   every bench, moves together. That sharing is the whole feature; it
   is also why an entry's `patch` here is LIVE (a parsed SubPatch, not
   JSON): compile and drill resolve against it directly, and one edit
   is visible everywhere without a reparse.

   Values, by contrast, are fully instance-owned. `InstVals` is what an
   instance remembers for the prototype nodes inside it, keyed by the
   node's path relative to the instance ('n5', 'n5/n2' through a nested
   ref). Entry-stored values are only initial values for future drops;
   changing an entry's defaults never moves an existing instance's
   knobs — no spooky knob motion in a patch you performed with.

   Nothing here imports above patch/: the library travels as pure data,
   passed in. The live singleton that persists it lives in persist/. */

import type { DialsSnap } from '@ldlework/dials';
import type { PatchEdge, PatchNode, SubPatch } from './graph';
import { cloneTree } from './slots';

/** what an instance remembers for one prototype node: its slot overlay
    (a DialsSnap — values AND modulation, since a param can be modulated
    across a ref boundary), its switch selection, and whether it replaced
    the node's media file with its own (else the entry's default blob
    rides). The overlay is serializable state; compile hydrates it onto
    a fresh clone of the prototype's default tree. */
export interface InstVals {
  slots: DialsSnap;
  sel?: number;
  media?: boolean;
}

/** a library entry: an id, a display name, and the LIVE patch it
    defines — parsed once at load, mutated in place by structural ops */
export interface LibEntryDef {
  id: string;
  name: string;
  patch: SubPatch;
}

/** the library as the document sees it — pure data, passed into
    compile/drill/applyOp so patch/ stays free of persistence */
export interface LibraryDoc {
  entries: LibEntryDef[];
}

/** the one function everyone hands around to resolve a ref to the patch
    it names; null when the entry is gone (an orphaned instance) */
export type EntryResolver = (id: string) => SubPatch | null;

/* ---- ref topology helpers --------------------------------------------- */

/** every entry reachable from `entryId` through nested ref modules —
    the transitive closure, for the cycle guard (dropping an entry into
    a view drilled through one of its own descendants would loop) */
export function refClosure(resolve: EntryResolver, entryId: string): Set<string> {
  const seen = new Set<string>();
  const walk = (id: string): void => {
    const patch = resolve(id);
    if (!patch) return;
    for (const n of patch.nodes) {
      if (n.type === 'module' && n.data.ref && !seen.has(n.data.ref)) {
        seen.add(n.data.ref);
        walk(n.data.ref);
      }
    }
  };
  walk(entryId);
  return seen;
}

/** the compiled prefixes of every live instance of `entryId` in this
    bench — walk from the document root through every ref module,
    accumulating the "n5/", "n2/n7/" prefixes under which the entry's
    nodes compile. A deletion sweep releases GPU state under each, so
    editing an entry's structure (or dropping the entry) reaches every
    sibling instance's rings, not just the one the user is looking at.
    Only instances reachable from the root have compiled state, so the
    root walk is authoritative — instances that live only inside other,
    undropped entries have no rings to release. */
export function instancePrefixes(root: SubPatch, resolve: EntryResolver, entryId: string): string[] {
  const out: string[] = [];
  const walk = (level: SubPatch, prefix: string): void => {
    for (const n of level.nodes) {
      if (n.type !== 'module' || n.data.ref === undefined) continue;
      const here = prefix + n.id + '/';
      if (n.data.ref === entryId) out.push(here);
      const inner = resolve(n.data.ref);
      if (inner) walk(inner, here);
    }
  };
  walk(root, '');
  return out;
}

/** sweep every instance's stale `vals` for a node removed from an entry.
    Entry node ids are re-mintable, so a stale `vals['n5']` left on a
    sibling instance would silently apply to an UNRELATED future node that
    reuses the id. So when an entry-scoped removeNode lands, delete each
    owning instance's keys for the departed node and its subtree.

    Live instance values always sit on the OUTERMOST ref instance in the
    doc tree (that is where writeEntry and the value router put them),
    keyed by the node's path relative to that instance. So walk the tree
    tracking the outermost ref node and the rel offset from it; each time
    the descent enters `entryId`, delete `rel + localId` and every key
    under `rel + localId + '/'` on the owning instance. Entry-stored inner
    inits (an intermediate ref module's own `vals`) are entry defaults, not
    live instance state — the entry write-back owns those; this sweeps the
    doc-tree instances the write-back can't see. */
export function sweepEntryVals(root: SubPatch, resolve: EntryResolver, entryId: string, localId: string): void {
  const walk = (level: SubPatch, owner: PatchNode | null, rel: string): void => {
    for (const n of level.nodes) {
      if (n.type !== 'module' || n.data.ref === undefined) continue;
      const outer = owner ?? n;                         // the outermost ref owns the vals
      const relHere = owner ? rel + n.id + '/' : '';    // rel from that owner down to this frame
      if (n.data.ref === entryId && outer.data.vals) {
        const key = relHere + localId;
        const sub = key + '/';
        for (const k of Object.keys(outer.data.vals))
          if (k === key || k.startsWith(sub)) delete outer.data.vals[k];
      }
      const inner = resolve(n.data.ref);
      if (inner) walk(inner, outer, relHere);
    }
  };
  walk(root, null, '');
}

/* ---- forking a drilled level into a fresh entry ----------------------- */

/** one value layer over the viewed level — the structural twin of
    drill's Overlay, taken structurally to keep library.ts below drill.ts */
interface ValLayer { base: string; vals: Record<string, InstVals> }

/** bake a drilled level into a fresh entry patch — a deep copy severed
    from the live tree, with the MERGED on-screen values captured.

    `level` is the viewed level unprojected to its own local ids; its
    non-module nodes already carry the merged values (the projection put
    them there), so those become the new entry's defaults as-is. A nested
    module node, though, is a REFERENCE whose inner values live in the
    owner instance's overlays, not in the module node — so its `vals` are
    rebuilt by merging the overlay slices that fall under its subtree on
    top of its own stored inits, exactly the merge compile would make. The
    fork keeps the ref (structure stays shared) and carries those baked
    vals so the new entry reproduces what was on screen. `prefix` is the
    viewed level's compiled prefix; `overlays` are the value layers,
    outermost first. */
export function bakeEntry(level: SubPatch, prefix: string, overlays: ValLayer[]): SubPatch {
  const nodes: PatchNode[] = level.nodes.map(n => {
    const data = { ...n.data, slots: cloneTree(n.data.slots) };
    if (n.type === 'module') data.vals = bakeModuleVals(n, prefix, overlays);
    return { ...n, position: { ...n.position }, data };
  });
  const edges: PatchEdge[] = level.edges.map(e => ({ ...e }));
  return { nodes, edges };
}

/* merge every overlay's slice under this module's subtree on top of its
   own stored inits, re-keyed relative to the module — the same layering
   compile applies, so the forked entry's nested-init defaults match what
   the instance showed. Overlays are outermost-first; apply innermost-first
   so the outermost wins, and finally the module's own stored inits sit
   under everything (they are the deepest defaults). */
function bakeModuleVals(m: PatchNode, prefix: string, overlays: ValLayer[]): Record<string, InstVals> {
  const out: Record<string, InstVals> = {};
  const sub = m.id + '/';                       // keys under this module, relative to the viewed level
  /* stored inits first (deepest), then overlays outermost-last so they win */
  for (const [k, iv] of Object.entries(m.data.vals ?? {})) out[k] = cloneInst(iv);
  for (let i = overlays.length - 1; i >= 0; i--) {
    const rel = prefix.slice(overlays[i].base.length) + sub;   // rel from overlay base to this module's subtree
    for (const [k, iv] of Object.entries(overlays[i].vals)) {
      if (!k.startsWith(rel)) continue;
      out[k.slice(rel.length)] = cloneInst(iv);                // re-key relative to the module
    }
  }
  return out;
}

function cloneInst(iv: InstVals): InstVals {
  const out: InstVals = { slots: cloneSnap(iv.slots) };
  if (iv.sel !== undefined) out.sel = iv.sel;
  if (iv.media) out.media = true;
  return out;
}

/* a DialsSnap is plain JSON-shaped state (value/depth/mode + nested
   attached params) — a structural deep copy severs the overlay from the
   tree it was captured off */
function cloneSnap(snap: DialsSnap): DialsSnap {
  return structuredClone(snap);
}
