/* The drill-in view mapping — the id namespace that makes editing one
   level of the tree line up with the flat compile.

   projectLevel/unproject: the level's nodes wearing the drill prefix,
   so the ids the editor works with ARE the compiled ids — faces,
   sparks, deletion sweeps and MIDI targets all line up without
   translation.

   viewContext: the same walk compile makes, but stopped at the viewed
   level — it tells the write-back WHERE an edit belongs. A doc level is
   the tree itself; an entry level is a library entry's own graph, and
   the walk carries back the outermost ref instance that owns the
   values (so a knob turn routes to its vals) and the layered overlays
   (so the projection can render the same merged view compile does). */

import { moduleInterface, type PatchEdge, type PatchNode, type SubPatch } from './graph';
import { applySnapOverlay, cloneTree, rebaseTree } from './slots';
import type { EntryResolver, InstVals } from './library';

export interface Crumb { id: string; name: string; entry?: { id: string; name: string } }

/** the drill id of a library entry entered straight from the shelf — no
    instance on the bench, the path stands inside the definition itself.
    Node ids are minted `n<k>`, so the `lib:` head can never collide with
    a module instance id, and the segment rides every string-typed seam
    (pathKey, compiled ids, the follow wire) unchanged. */
export const libCrumbId = (entryId: string): string => 'lib:' + entryId;

/** the entry id a lib-rooted drill segment names, or null for a module id */
export const libHead = (seg: string): string | null =>
  seg.startsWith('lib:') ? seg.slice(4) : null;

/** walk the tree to the level a breadcrumb path names; null if an
    ancestor module vanished. A module resolves its level through the
    library (the resolver); a missing entry is null — an orphan can't be
    drilled. */
export function levelAt(root: SubPatch, path: Crumb[], resolve?: EntryResolver): SubPatch | null {
  let cur = root;
  for (const c of path) {
    const eid = libHead(c.id);
    if (eid !== null) {
      const inner = resolve?.(eid) ?? null;
      if (!inner) return null;
      cur = inner;
      continue;
    }
    const m = cur.nodes.find(n => n.id === c.id && n.type === 'module');
    if (!m || m.data.ref === undefined) return null;
    const inner = resolve?.(m.data.ref) ?? null;
    if (!inner) return null;
    cur = inner;
  }
  return cur;
}

/** one value layer over the viewed level: the compiled prefix it
    covers and the vals keyed relative to it (the same shape compile's
    frames carry) */
export interface Overlay { base: string; vals: Record<string, InstVals> }

/** where the viewed level's edits belong.

    `doc` — an ordinary tree level; the write-back mutates it directly.

    `entry` — a library entry's own graph. Structure edits land on the
    entry (`entryId`); VALUE edits land on the OUTERMOST ref instance
    (`owner`), at its `vals` keyed by the node's path relative to it
    (`relPrefix` + node id). `overlays` are the value layers in descent
    order (outermost first), the same order compile's frames carry, so
    the projection merges them the same way — innermost applied first,
    outermost winning.

    An entry level with NO owner is the shelf-entered view (a lib-rooted
    path with no deeper ref crumb): no instance owns values, so value
    edits are the entry's own defaults and the write-back lands the view
    on the entry wholesale. */
export interface ViewCtx {
  kind: 'doc' | 'entry';
  level: SubPatch;
  entryId?: string;
  owner?: { docPath: string[]; instId: string; relPrefix: string };
  overlays?: Overlay[];
}

/** walk the drill path resolving refs, and report where the viewed
    level's edits belong. Null if an ancestor module vanished. */
export function viewContext(root: SubPatch, path: Crumb[], resolve: EntryResolver): ViewCtx | null {
  let cur = root;
  let base = '';                       // running compiled prefix
  const docPath: string[] = [];        // plain crumbs before the first ref
  let owner: ViewCtx['owner'] | undefined;
  let entryId: string | undefined;
  const overlays: Overlay[] = [];

  for (const c of path) {
    const eid = libHead(c.id);
    if (eid !== null) {
      /* the shelf-entered root: the level IS the entry's own graph. No
         instance exists to own values — edits here are the definition's
         defaults — so no owner and no overlay are created. The segment
         still extends base and docPath, so a ref module INSIDE the entry
         resolves as the value-owning instance exactly as it would in the
         doc: its vals are the entry's stored nested defaults. */
      const inner = resolve(eid);
      if (!inner) return null;
      base += c.id + '/';
      docPath.push(c.id);
      entryId = eid;
      cur = inner;
      continue;
    }
    const m = cur.nodes.find(n => n.id === c.id && n.type === 'module');
    if (!m || m.data.ref === undefined) return null;
    const inner = resolve(m.data.ref);
    if (!inner) return null;
    base += c.id + '/';
    /* the outermost ref on the path owns the values. Its own vals are the
       outermost overlay; every ref crumb below it contributes an inner
       overlay from the module node's stored inits inside the entry.
       relPrefix tracks the path from the owner instance down to the
       current entry, so a value write keys correctly. */
    overlays.push({ base, vals: m.data.vals ?? {} });
    if (!owner) owner = { docPath: [...docPath], instId: c.id, relPrefix: '' };
    else owner.relPrefix += c.id + '/';
    entryId = m.data.ref;
    cur = inner;
  }

  /* a lib-rooted path with no deeper ref crumb: an entry level with NO
     owner. The write-back reads that as "the view is the definition" —
     structure and values land on the entry wholesale. overlays stays
     undefined so the projection shares the prototype's data, the same
     aliasing the root doc level rides. */
  if (!owner) return entryId !== undefined
    ? { kind: 'entry', level: cur, entryId }
    : { kind: 'doc', level: cur };
  return { kind: 'entry', level: cur, entryId, owner, overlays };
}

/** one level of the tree as editor state: ids wear the drill prefix,
    and edges naming module ports that no longer exist (or changed
    flavor) are pruned — they die permanently on the next write-back.

    On an entry level the overlays merge the instance's values into each
    non-module node's data (fresh objects, the same merge compile makes),
    so the drilled view shows the instance's knobs, not the entry's bare
    defaults. Module nodes project as-is — they carry no merged values. */
export function projectLevel(level: SubPatch, prefix: string, overlays?: Overlay[], resolve?: EntryResolver): SubPatch {
  /* a module's interface prunes boundary edges to ports that no longer
     exist. A module's structure lives in the entry it names, resolved
     through the library — without a resolver a ref module offers no ports
     and its boundary edges would all die, so callers on a live bench must
     pass one. */
  const iface = new Map<string, Set<string>>();
  for (const n of level.nodes)
    if (n.type === 'module')
      iface.set(n.id, new Set(moduleInterface(
        n.data.ref !== undefined ? (resolve?.(n.data.ref) ?? undefined) : undefined,
      ).map(p => p.dir + p.handle)));
  const nodes = level.nodes.map(n =>
    overlays && n.type !== 'module' ? mergeInto(n, prefix, overlays) : { ...n, id: prefix + n.id });
  const edges: PatchEdge[] = [];
  for (const e of level.edges) {
    const sIf = iface.get(e.source);
    if (sIf && !sIf.has('out' + e.sourceHandle)) continue;
    const tIf = iface.get(e.target);
    if (tIf && !tIf.has('in' + e.targetHandle)) continue;
    edges.push({ ...e, id: prefix + e.id, source: prefix + e.source, target: prefix + e.target });
  }
  return { nodes, edges };
}

/* a non-module node under an entry level, its values merged from the
   overlays — entry defaults first, then each instance layer, outermost
   winning. The same merge compile makes, so the drilled view and the
   engine agree on every knob. Fresh data + v: the projected node must
   never alias the entry's shared prototype. */
function mergeInto(n: PatchNode, prefix: string, overlays: Overlay[]): PatchNode {
  const compiledId = prefix + n.id;
  /* fresh slot tree (cloned sources) + each overlay's snap hydrated
     innermost-first, outermost winning — the same merge compile makes,
     so the drilled view and the engine agree on every knob. The clone
     is what keeps the projected node from aliasing the entry prototype.
     Rebasing before the overlays makes the ENTRY's current values the
     clone's reset targets — an instance's knobs default to the library
     definition's live state, so double-click returns a tweaked knob to
     what the module says, not to the kind's factory default. */
  const data = { ...n.data, slots: cloneTree(n.data.slots) };
  rebaseTree(data.slots);
  for (let i = overlays.length - 1; i >= 0; i--) {
    const iv = overlays[i].vals[compiledId.slice(overlays[i].base.length)];
    if (iv) {
      applySnapOverlay(data.slots, iv.slots);
      if (iv.sel !== undefined) data.sel = iv.sel;
    }
  }
  return { ...n, id: compiledId, data };
}

/** the inverse: editor state back to the level's local ids */
export function unproject(nodes: PatchNode[], edges: PatchEdge[], prefix: string): SubPatch {
  if (!prefix) return { nodes, edges };
  const strip = (s: string) => s.startsWith(prefix) ? s.slice(prefix.length) : s;
  return {
    nodes: nodes.map(n => ({ ...n, id: strip(n.id) })),
    edges: edges.map(e => ({ ...e, id: strip(e.id), source: strip(e.source), target: strip(e.target) })),
  };
}

/** carry an orphan's boundary edges across a write-back.

    A ref module whose entry is gone (`resolve(ref) === null`) offers no
    ports, so the projection prunes every edge that lands on it, and the
    unprojected write-back would then persist that pruning — destroying the
    wires permanently, so they never come back when the entry returns. To
    keep the "goes dark until the entry returns" story honest, the DOCUMENT
    keeps those edges: any edge in the pre-write level touching an orphan is
    re-appended to the written edges (deduped by id). The view still hides
    them (there is nowhere on screen to land them); the tree does not. */
export function carryOrphanEdges(prev: SubPatch, written: PatchEdge[], resolve: EntryResolver): PatchEdge[] {
  const orphan = new Set(
    prev.nodes.filter(n => n.type === 'module' && n.data.ref !== undefined && resolve(n.data.ref) === null).map(n => n.id),
  );
  if (!orphan.size) return written;
  const have = new Set(written.map(e => e.id));
  const carried = prev.edges.filter(e => (orphan.has(e.source) || orphan.has(e.target)) && !have.has(e.id));
  return carried.length ? [...written, ...carried] : written;
}
