/* The op vocabulary — the serializable, replayable mutations of a
   patch. Every edit a peer can make is one of these; applied
   identically on any client, they are the one language the collab
   layer speaks (HANDOFF §10). Today they only reroute the editor's
   own mutations through a single choke point, but the shape is the
   network's from day one.

   An op names WHERE it lands with an OpScope: a `doc` scope walks the
   module tree by instance ids from the root to the level being edited
   (`path`), then addresses a node by its level-local id. `path: []`
   is the root bench. M2 will add an `entry` scope for by-reference
   library edits — the union is left open for it.

   The appliers here are PURE with respect to the rest of the app: they
   mutate the document tree (and globals) and nothing else. Side effects
   that belong to other layers — releasing a departed node's GPU state,
   dropping engine rings, pruning React Flow selection — are the
   dispatcher's job, driven by what an applier reports back. When in
   doubt the appliers copy the editor's existing semantics verbatim
   rather than reinventing them. */

import { levelAt } from './drill';
import { handleKind, type NodeData, type PatchEdge, type PatchNode, type SubPatch } from './graph';
import type { EntryResolver, InstVals, LibEntryDef, LibraryDoc } from './library';

/** where an op lands.

    A `doc` op edits the module TREE: `path` is the chain of
    module-instance ids from the root down to the level, `[]` being the
    root bench. Values crossing a ref boundary land here too — on the
    outermost instance node, at its `vals[rel]` (see `rel` on setParam).

    An `entry` op edits a library ENTRY's structure directly, by id.
    There is no path: an entry level is always the entry's own root, and
    a nested module inside it is a ref to some OTHER entry, addressed by
    its own id when the drill descends further. Structural edits made
    while drilled through a ref resolve to one of these, so every
    instance of the entry moves together on the next compile. */
export type OpScope =
  | { kind: 'doc'; path: string[] }
  | { kind: 'entry'; id: string };

/* the cosmetic / behavioral flags a device carries in its NodeData,
   beyond its knob values — the props `setProp` may flip */
export type PropKey = 'open' | 'labels' | 'momentary';

export type Op =
  /* setParam / setSel carry an optional `rel`: with it, `node` is the
     outermost ref INSTANCE (level-local in the doc scope's level) and
     the write lands in that instance's `vals[rel]` — a value crossing a
     ref boundary is instance-owned. Without `rel`, semantics are
     unchanged (the aliased in-place write into the node's own data). */
  | { kind: 'setParam'; scope: OpScope; node: string; rel?: string; key: string; v: number }
  | { kind: 'setSel'; scope: OpScope; node: string; rel?: string; i: number }
  /* an instance replaced a media node's file with its own — set the
     `vals[rel].media` marker so compile stamps the override key */
  | { kind: 'markMedia'; scope: OpScope; node: string; rel: string; on: boolean }
  | { kind: 'rename'; scope: OpScope; node: string; name: string }
  | { kind: 'setFlavor'; scope: OpScope; node: string; flavor: 'v' | 'c' }
  | { kind: 'setProp'; scope: OpScope; node: string; key: PropKey; v: boolean }
  | { kind: 'togglePort'; scope: OpScope; node: string; param: string; on: boolean }
  | { kind: 'moveNode'; scope: OpScope; node: string; x: number; y: number }
  | { kind: 'addNode'; scope: OpScope; node: PatchNode }
  | { kind: 'removeNode'; scope: OpScope; id: string }
  | { kind: 'connect'; scope: OpScope; edge: PatchEdge }
  | { kind: 'disconnect'; scope: OpScope; id: string }
  /* the library's own lifecycle — entries are collab state like any
     other, so their births, renames and deaths are ops on the wire */
  | { kind: 'entryCreate'; entry: LibEntryDef }
  | { kind: 'entryRename'; id: string; name: string }
  | { kind: 'entryDelete'; id: string }
  | { kind: 'setGlobal'; k: string; v: number }
  /* a wholesale swap (New / paste / preset). Paste carries the source's
     globals so the wire reproduces them on the far side; the applier
     applies them (and retunes) before the rebuild. New passes none. */
  | { kind: 'replaceGraph'; patch: SubPatch; globals?: Record<string, number> };

/** what applyOp reports so the dispatcher can drive the cross-layer
    sweeps the pure document can't reach — the level-local ids of nodes
    that left the graph (each still wearing its scope, for the caller to
    compile into a released id). `graph` marks the wholesale replacements
    (New/paste/preset) whose teardown sweeps everything. */
export interface OpEffect { removed: string[]; graph: boolean }

const NONE: OpEffect = { removed: [], graph: false };

/** apply an op to the document — mutating the scoped level of the tree
    (or an entry, or the globals, or the library) in place, exactly as
    the editor would. The library is passed in as pure data, so patch/
    imports nothing above it. Returns the teardown the dispatcher owes
    the other layers. */
export function applyOp(root: SubPatch, globals: Record<string, number>, lib: LibraryDoc, op: Op): OpEffect {
  if (op.kind === 'setGlobal') { globals[op.k] = op.v; return NONE; }
  if (op.kind === 'replaceGraph') { root.nodes = op.patch.nodes; root.edges = op.patch.edges; return { removed: [], graph: true }; }

  /* library lifecycle — pure mutations of lib.entries. entryDelete
     reports no removals: the compiled instances that go dark are the
     dispatcher's release sweep, not a level edit here. */
  if (op.kind === 'entryCreate') { lib.entries = [...lib.entries, op.entry]; return NONE; }
  if (op.kind === 'entryRename') { const e = lib.entries.find(e => e.id === op.id); if (e) e.name = op.name; return NONE; }
  if (op.kind === 'entryDelete') { lib.entries = lib.entries.filter(e => e.id !== op.id); return { removed: [], graph: false }; }

  /* resolve the level the op names: an entry scope IS the entry's own
     root graph; a doc scope walks the tree, resolving any ref module it
     crosses through the library (transition benches may still hold
     embedded patches, which levelAt handles too) */
  const resolve: EntryResolver = id => lib.entries.find(e => e.id === id)?.patch ?? null;
  const scope = op.scope;
  const level = scope.kind === 'entry'
    ? (lib.entries.find(e => e.id === scope.id)?.patch ?? null)
    : levelAt(root, scope.path.map(id => ({ id, name: '' })), resolve);
  if (!level) return NONE;

  switch (op.kind) {
    /* a value with `rel` is instance-owned: it lands in the outermost
       instance's vals[rel], NOT the prototype node's shared data.
       Without `rel` the write is the old aliased in-place one — the
       compiled mirror shares this very object by reference (that's how
       an unmounted MIDI write reaches the engine without a recompile). */
    case 'setParam': return op.rel !== undefined
      ? withVals(level, op.node, op.rel, iv => { iv.v[op.key] = op.v; })
      : withData(level, op.node, d => { d.v[op.key] = op.v; });
    case 'setSel': return op.rel !== undefined
      ? withVals(level, op.node, op.rel, iv => { iv.sel = op.i; })
      : withData(level, op.node, d => { d.sel = op.i; });
    case 'markMedia': return withVals(level, op.node, op.rel, iv => { iv.media = op.on; });
    case 'rename': return withData(level, op.node, d => { d.name = op.name; });
    case 'setProp': return withData(level, op.node, d => { d[op.key] = op.v; });
    case 'setFlavor': return setFlavor(level, op.node, op.flavor);
    case 'togglePort': return togglePort(level, op.node, op.param, op.on);
    case 'moveNode': return moveNode(level, op.node, op.x, op.y);
    case 'addNode': level.nodes = [...level.nodes, op.node]; return NONE;
    case 'removeNode': return removeNode(level, op.id);
    case 'connect': return connect(level, op.edge);
    case 'disconnect': level.edges = level.edges.filter(e => e.id !== op.id); return NONE;
  }
}

/* ---- the per-op appliers ----------------------------------------------- */

/* a node's data (and its v map) is shared by reference with the
   compiled mirror, so a data edit mutates the SAME object in place —
   that aliasing is what an unmounted engine/MIDI read sees, with no
   recompile to re-establish it. (On the VIEWED level the applier never
   comes here: it routes through React Flow, whose write-back + recompile
   own the mirror.) */
function withData(level: SubPatch, id: string, edit: (d: NodeData) => void): OpEffect {
  const n = level.nodes.find(n => n.id === id);
  if (n) edit(n.data);
  return NONE;
}

/* a value crossing a ref boundary is instance-owned: it lands in the
   instance node's vals map, keyed by the prototype node's path relative
   to the instance. The entry that `node` refers to keeps its own
   defaults untouched — this instance just remembers its own knob. A
   partial vals entry is fine; compile merges per key. */
function withVals(level: SubPatch, id: string, rel: string, edit: (iv: InstVals) => void): OpEffect {
  const n = level.nodes.find(n => n.id === id);
  if (n) {
    const vals = (n.data.vals ??= {});
    edit(vals[rel] ??= { v: {} });
  }
  return NONE;
}

/* flipping an IN/OUT's flavor swaps the signal kind of the port it
   defines, so every wire on that device is the wrong kind now and dies
   — the same drop modules.tsx makes */
function setFlavor(level: SubPatch, id: string, flavor: 'v' | 'c'): OpEffect {
  level.edges = level.edges.filter(e => e.source !== id && e.target !== id);
  return withData(level, id, d => { d.flavor = flavor; });
}

/* un-exposing a control port drops the wires landing on it — they'd
   have nowhere to go — matching Shell.tsx's togglePort */
function togglePort(level: SubPatch, id: string, param: string, on: boolean): OpEffect {
  if (!on) level.edges = level.edges.filter(e => !(e.target === id && e.targetHandle === `c:${param}`));
  return withData(level, id, d => {
    const cur = d.ports ?? [];
    d.ports = on ? [...cur, param] : cur.filter(x => x !== param);
  });
}

function moveNode(level: SubPatch, id: string, x: number, y: number): OpEffect {
  const n = level.nodes.find(n => n.id === id);
  if (n) n.position = { x, y };
  return NONE;
}

/* a departing node takes its wires with it; the id rides back so the
   dispatcher can release the node's cross-layer state */
function removeNode(level: SubPatch, id: string): OpEffect {
  level.nodes = level.nodes.filter(n => n.id !== id);
  level.edges = level.edges.filter(e => e.source !== id && e.target !== id);
  return { removed: [id], graph: false };
}

/* a video target takes one wire (the new one replaces whatever landed
   there); a control target fans in (several dials share it, last moved
   wins). A re-dragged identical wire just refreshes — no duplicate.
   The exact rule from useBench.onConnect. */
function connect(level: SubPatch, edge: PatchEdge): OpEffect {
  const ctl = handleKind(edge.targetHandle) === 'c';
  level.edges = [
    ...level.edges.filter(e =>
      !(e.source === edge.source && e.sourceHandle === edge.sourceHandle && e.target === edge.target && e.targetHandle === edge.targetHandle)
      && (ctl || !(e.target === edge.target && e.targetHandle === edge.targetHandle))),
    edge,
  ];
  return NONE;
}
