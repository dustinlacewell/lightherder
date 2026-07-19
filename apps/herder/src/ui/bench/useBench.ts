/* The bench's spine: the patch TREE, the drill path, and the React
   Flow state showing one level of it. React owns the current level;
   every render writes it back — into the tree for a doc level, or split
   between a library entry (structure) and the owning instance (values)
   for a level drilled through a by-reference module — and hands the
   flat compile to the runtime mirror for the engine. */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { useEdgesState, useNodesState, type Connection, type EdgeChange, type IsValidConnection, type NodeChange } from '@xyflow/react';
import {
  carryOrphanEdges, compile, instancePrefixes, levelAt, libCrumbId, libHead, makeEdge, projectLevel,
  slotsFor, sweepEntryVals, treeToSnap, unproject, validConnection, viewContext, type Crumb, type InstVals, type SubPatch, type ViewCtx,
} from '../../patch';
import { libStore } from '../../persist';
import { consumeEcho, dispatch, mirror, record, registerApplier, releaseNode } from '../../runtime';
import { announcePresence } from '../../session';
import * as midi from '../../midi';
import { bootRoot, bootView } from './boot';
import { useOps } from './useOps';
import { wires, type BenchEdge, type BenchNode } from './types';

export interface Bench {
  nodes: BenchNode[];
  edges: BenchEdge[];
  setNodes: Dispatch<SetStateAction<BenchNode[]>>;
  setEdges: Dispatch<SetStateAction<BenchEdge[]>>;
  handleNodesChange: (changes: NodeChange<BenchNode>[]) => void;
  handleEdgesChange: (changes: EdgeChange<BenchEdge>[]) => void;
  onConnect: (c: Connection) => void;
  isValid: IsValidConnection<BenchEdge>;
  /** the whole tree, flattened — what the engine sees */
  flat: SubPatch;
  path: Crumb[];
  prefix: string;
  /** view id → the current level's local id */
  strip: (id: string) => string;
  enter: (viewId: string, name: string) => void;
  /** stand inside a library entry straight from the shelf — no instance
      required; the level viewed IS the shared definition */
  enterLib: (entryId: string) => void;
  jump: (depth: number) => void;
  /** follow: land on the level a remote path names — false if an id along
      it resolves to no module here (a sync race; stay put) */
  goTo: (ids: string[]) => boolean;
  /** the level currently being viewed, out of the live tree */
  level: () => SubPatch | null;
  root: () => SubPatch;
  rebuild: (next: SubPatch) => void;
}

/* a placeholder scope on a recorded op — record()'s canonicalize-only
   applier pass rebuilds the scope from the op's compiled id, so this
   value is never read; it only satisfies the Op union's shape. */
const DOC_ROOT = { kind: 'doc' as const, path: [] as string[] };

/* freshen the module nodes along an abandoned drill tail so their port
   faces re-render with the edits just made inside */
function freshenTail(root: SubPatch, pth: Crumb[], depth: number): void {
  for (let i = depth; i < pth.length; i++) {
    const parent = levelAt(root, pth.slice(0, i), libStore.resolve);
    const m = parent?.nodes.find(n => n.id === pth[i].id);
    if (m) m.data = { ...m.data };
  }
}

export function useBench(): Bench {
  /* the whole patch TREE; React Flow shows one level of it at a time */
  const rootRef = useRef<SubPatch>(bootRoot);
  const [path, setPath] = useState<Crumb[]>([]);
  const pathKey = path.map(c => c.id).join('/');
  const prefix = pathKey ? pathKey + '/' : '';
  /* which level the RF state currently holds. The key guards the
     write-back across the one render where the path changed but state
     hasn't reprojected yet, and lets the projection effect spot a path
     change. */
  const viewKeyRef = useRef<{ key: string }>({ key: '' });
  /* the library version, tracked so an EXTERNAL entry edit reprojects the
     viewed level. It is deliberately NOT in the compile memo's deps:
     every library mutation path already changes nodes/edges identity
     (our own viewed write-back) or bumps docVer (a dispatched entry-
     scoped structural op), so the recompile is already covered. */
  const libVer = useSyncExternalStore(libStore.subscribe, libStore.version);
  /* the version the projection effect last reconciled, and a COUNT of
     library bumps this bench caused itself and has not yet accounted for.
     Own-bump accounting replaces predicting the next version: a write-back
     increments ownBumps just before its touch(), and the projection effect
     consumes up to `version - lastSeenVer` of them — reprojecting only when
     the delta exceeds its own bumps, i.e. a genuinely FOREIGN touch landed.
     A foreign touch riding the SAME task as our own nodes change (e.g. a
     toolbar module spawn's entryCreate) no longer diverges the prediction
     forever: each own bump is consumed exactly once, so the count settles. */
  const lastSeenVerRef = useRef(libStore.version());
  const ownBumpsRef = useRef(0);
  /* set by an entry-level write-back to the entry it dirtied; an effect
     flushes libStore.touch() afterwards — never during render, where a
     touch could re-enter a subscriber's render synchronously */
  const entryDirtyRef = useRef<string | null>(null);
  /* a monotonic document version. A structural op applied in place on a
     level React isn't showing (an entry edit compiled into sibling
     instances, a remote peer's edit tomorrow) mutates the tree behind
     React's back; bumping this re-runs the flat compile so the engine
     leaves the stale graph. Param writes never bump — they ride the
     writeParam router and must stay render-free. */
  const [docVer, setDocVer] = useState(0);
  const bumpDoc = useCallback(() => setDocVer(v => v + 1), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<BenchNode>(bootView.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<BenchEdge>(wires(bootView.edges));
  /* the latest RF nodes, so the reprojection effect can read selection
     off the outgoing list without depending on `nodes` (which would wake
     it on every edit) */
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  /* write the view back into the document, then hand the engine the flat
     compile of the whole tree. A doc level writes straight into the
     tree; an entry level splits — structure into the library entry,
     values into the owning instance. Both are keyed on the graph's
     identity: a render caused by anything else (preview resize,
     selection chrome) does no graph work. */
  const lastSync = useRef<{ n: unknown; e: unknown }>({ n: null, e: null });
  if (viewKeyRef.current.key === pathKey && (lastSync.current.n !== nodes || lastSync.current.e !== edges)) {
    lastSync.current = { n: nodes, e: edges };
    const ctx = viewContext(rootRef.current, path, libStore.resolve);
    if (ctx) {
      const local = unproject(nodes, edges, prefix);
      /* an orphan ref module's boundary edges were pruned by the projection
         (no ports to land on) — carry them across from the pre-write level
         so the wires survive in the document until the entry returns */
      local.edges = carryOrphanEdges(ctx.level, local.edges, libStore.resolve);
      if (ctx.kind === 'doc') { ctx.level.nodes = local.nodes; ctx.level.edges = local.edges; }
      else {
        writeEntry(rootRef.current, ctx, local);
        /* the library will change on the flush — mark the entry for it.
           The own-bump count is incremented at flush time (beside the
           actual touch), so the projection effect can tell this bump from
           a foreign one without predicting a version number. */
        entryDirtyRef.current = ctx.entryId!;
      }
    }
  }
  /* the engine's graph. A lib-rooted path SOLOS the shelf-entered entry:
     a synthetic one-module root compiles the entry's innards — defaults
     merged, media keys stamped, cycles guarded — under the exact ids the
     view holds, so faces, rings, sparks and the writeParam router all
     line up. The bench graph parks until the path returns; the release
     effect below sweeps whichever graph just left. */
  const flat = useMemo(() => {
    const eid = path.length ? libHead(path[0].id) : null;
    if (eid !== null) {
      const soloRoot: SubPatch = {
        nodes: [{
          id: path[0].id, type: 'module', position: { x: 0, y: 0 },
          data: { name: '', slots: slotsFor('module'), sel: 0, momentary: false, open: false, ref: eid, vals: {} },
        }],
        edges: [],
      };
      return compile(soloRoot, libStore.resolve);
    }
    return compile(rootRef.current, libStore.resolve);
  }, [nodes, edges, pathKey, docVer]);
  mirror.nodes = flat.nodes;
  mirror.edges = flat.edges;

  /* a recompile that drops nodes from the engine — above all the solo
     swap, which parks a whole graph in one step — must release their
     rings, faces and gestures, or they linger against ids the engine no
     longer runs. Removals inside a level are already released at their
     call sites; releaseNode is idempotent, so the overlap is free. */
  const prevFlatRef = useRef(flat);
  useEffect(() => {
    const prev = prevFlatRef.current;
    if (prev === flat) return;
    prevFlatRef.current = flat;
    const live = new Set(flat.nodes.map(n => n.id));
    for (const n of prev.nodes) if (!live.has(n.id)) releaseNode(n.id);
  }, [flat]);

  /* flush the entry write-back's library touch after the render that
     dirtied it — a debounced persist plus a version bump every ModuleNode
     and sibling view subscribes to */
  useEffect(() => {
    if (entryDirtyRef.current === null) return;
    entryDirtyRef.current = null;
    /* count this bump as OURS before it lands, so the projection effect
       consumes it instead of reprojecting over the live view */
    ownBumpsRef.current++;
    libStore.touch();
  }, [nodes, edges]);

  /* navigation and reprojection: project the new level on a path change,
     and reproject the current level when a FOREIGN library edit has left
     the view stale. "Foreign" is decided by own-bump accounting, not a
     predicted version: since the effect last woke, the version advanced by
     `delta = libVer - lastSeen`; we caused `min(delta, ownBumps)` of those
     ourselves, so only `delta > consumed` means someone else touched — a
     silent entry op, a future remote edit. This terminates because a
     reprojection's OWN write-back touch is counted as own and consumed on
     the next pass, so a foreign bump arriving in the same task as our own
     nodes change can no longer loop. Both paths go through viewContext so
     an entry level shows the instance's merged values, exactly as compile
     renders them. */
  useEffect(() => {
    const changedPath = viewKeyRef.current.key !== pathKey;
    const delta = libVer - lastSeenVerRef.current;
    lastSeenVerRef.current = libVer;
    const consumed = Math.min(delta, ownBumpsRef.current);
    ownBumpsRef.current -= consumed;
    const staleLib = delta > consumed;
    if (!changedPath && !staleLib) return;
    const ctx = viewContext(rootRef.current, path, libStore.resolve);
    if (!ctx) { setPath([]); return; }
    viewKeyRef.current = { key: pathKey };
    const v = projectLevel(ctx.level, prefix, ctx.overlays, libStore.resolve);
    /* a reprojection replaces the RF node list wholesale — carry the
       user's current selection across it by id, so a library touch (which
       pre-M2 never reprojected at all) doesn't gratuitously wipe it */
    const sel = new Set<string>();
    for (const n of nodesRef.current) if (n.selected) sel.add(n.id);
    setNodes(v.nodes.map(n => (sel.has(n.id) ? { ...n, selected: true } : n)));
    setEdges(wires(v.edges));
  }, [path, pathKey, prefix, libVer, setNodes, setEdges]);

  /* drill into a module (its ⤢ button / double-click hands us the
     view id), and climb back out on the breadcrumb. A ref module attaches
     its library entry to the crumb, so the breadcrumb can flag that the
     level being viewed edits a shared definition. */
  const enter = useCallback((viewId: string, name: string) => {
    setPath(pth => {
      const pfx = pth.length ? pth.map(c => c.id).join('/') + '/' : '';
      const local = viewId.startsWith(pfx) ? viewId.slice(pfx.length) : viewId;
      const lvl = levelAt(rootRef.current, pth, libStore.resolve);
      const m = lvl?.nodes.find(n => n.id === local && n.type === 'module');
      const ref = m?.data.ref;
      const entry = ref !== undefined
        ? { id: ref, name: libStore.entries().find(e => e.id === ref)?.name ?? name }
        : undefined;
      return [...pth, { id: local, name, entry }];
    });
  }, []);
  /* enter a library entry from the shelf: a one-crumb lib-rooted path.
     The crumb carries its entry so the breadcrumb glyph, the warning
     chip and the drop-cycle guard all read it like a drilled ref. An
     abandoned drill tail freshens like a jump's, so module faces
     re-render any edits made inside. */
  const enterLib = useCallback((entryId: string) => {
    const en = libStore.entries().find(e => e.id === entryId);
    if (!en) return;
    setPath(pth => {
      freshenTail(rootRef.current, pth, 0);
      return [{ id: libCrumbId(entryId), name: en.name, entry: { id: entryId, name: en.name } }];
    });
  }, []);
  const jump = useCallback((depth: number) => {
    setPath(pth => {
      freshenTail(rootRef.current, pth, depth);
      return pth.slice(0, depth);
    });
  }, []);

  /* follow: land wherever the host's path points — crumbs derived by
     walking our own tree, so the breadcrumb behaves exactly as if drilled
     by hand (a ref module's crumb carries its entry). A path segment that
     names no module here (a sync race, a graph we differ on) lands
     nowhere and reports it, so the caller can hold its camera too. */
  const goTo = useCallback((ids: string[]): boolean => {
    const crumbs: Crumb[] = [];
    for (const id of ids) {
      /* a lib-rooted segment names the entry itself, not a node — it
         resolves through the library, or nowhere (entry not here yet) */
      const eid = libHead(id);
      if (eid !== null) {
        const en = libStore.entries().find(e => e.id === eid);
        if (!en) return false;
        crumbs.push({ id, name: en.name, entry: { id: eid, name: en.name } });
        continue;
      }
      const lvl = levelAt(rootRef.current, crumbs, libStore.resolve);
      const m = lvl?.nodes.find(n => n.id === id && n.type === 'module');
      if (!m) return false;
      const ref = m.data.ref;
      const entry = ref !== undefined
        ? { id: ref, name: libStore.entries().find(e => e.id === ref)?.name ?? m.data.name }
        : undefined;
      crumbs.push({ id, name: m.data.name, entry });
    }
    setPath(pth => {
      if (pth.map(c => c.id).join('/') === ids.join('/')) return pth;
      let keep = 0;
      while (keep < pth.length && keep < ids.length && pth[keep].id === ids[keep]) keep++;
      freshenTail(rootRef.current, pth, keep);
      return crumbs;
    });
    return true;
  }, []);

  const strip = useCallback((id: string) => id.startsWith(prefix) ? id.slice(prefix.length) : id, [prefix]);

  /* React Flow applies drags and Delete-key removals locally itself;
     we RECORD them so the op still reaches the wire without a re-apply.
     A removed node's cross-layer state is released here — and when the
     viewed level is a library ENTRY, the same node is a prototype shared
     by every instance, so its state must be released in EVERY sibling
     instance too (React Flow covered only the viewed one). A drag is
     recorded once, when it settles. The recorded op is addressed by
     COMPILED id (what React Flow holds); record()'s canonicalize-only
     applier pass scopes it — an { entry } scope for a structural edit
     made while viewing a library entry, a { doc, path } otherwise. */
  const handleNodesChange = useCallback((changes: NodeChange<BenchNode>[]) => {
    const ctx = changes.some(ch => ch.type === 'remove')
      ? viewContext(rootRef.current, path, libStore.resolve) : null;
    /* presence: an in-flight drag streams its frames (one entry per
       dragged node — a multi-select drags several per change batch); the
       settle clears them. Coalesced per rAF inside announcePresence, a
       no-op with no live session. */
    const dragging: { id: string; x: number; y: number }[] = [];
    let settled = false;
    for (const ch of changes) {
      if (ch.type === 'remove') {
        releaseNode(ch.id);
        if (ctx?.kind === 'entry') {
          const localId = strip(ch.id);
          for (const p of instancePrefixes(rootRef.current, libStore.resolve, ctx.entryId!))
            if (prefix !== p) releaseNode(p + localId);
          /* the node left the shared entry: its id is re-mintable, so
             delete the stale vals every SIBLING instance still holds for
             it (the viewed instance's own keys are pruned by the
             write-back). */
          sweepEntryVals(rootRef.current, libStore.resolve, ctx.entryId!, localId);
        }
        /* the cross-layer releases above must run for a REMOTE removal too
           (applyViewed drops the RF node but the sibling sweeps live only
           here) — but if this removal is the echo of a remote application we
           armed, it must NOT record back onto the wire. consumeEcho reports
           and clears that expectation. */
        if (!consumeEcho(ch.id))
          record({ kind: 'removeNode', scope: DOC_ROOT, id: ch.id });
      } else if (ch.type === 'position' && ch.position) {
        if (ch.dragging) dragging.push({ id: ch.id, x: ch.position.x, y: ch.position.y });
        else {
          settled = true;
          record({ kind: 'moveNode', scope: DOC_ROOT, node: ch.id, x: ch.position.x, y: ch.position.y });
        }
      }
    }
    if (dragging.length) announcePresence({ drag: dragging });
    else if (settled) announcePresence({ drag: undefined });
    onNodesChange(changes);
  }, [onNodesChange, strip, path, prefix]);

  /* React Flow applies an edge deletion (a selected wire hit with Delete)
     locally itself, and until M3 that removal never reached the op stream
     — the wire vanished on the host but no peer heard of it. We RECORD the
     disconnect so it does. Unlike a node id, an edge id can't be
     re-scoped by canonicalize (an edge id is not a compiled node id), so
     the scope is resolved HERE from the viewed level — { entry } when
     drilled through a ref, { doc, path } otherwise — and the id stripped
     to its level-local form, the exact shape a disconnect drawn at this
     level would carry. */
  const handleEdgesChange = useCallback((changes: EdgeChange<BenchEdge>[]) => {
    const removes = changes.filter(ch => ch.type === 'remove');
    if (removes.length) {
      const ctx = viewContext(rootRef.current, path, libStore.resolve);
      const scope = ctx?.kind === 'entry'
        ? { kind: 'entry' as const, id: ctx.entryId! }
        : { kind: 'doc' as const, path: path.map(c => c.id) };
      /* a remote structural op (removeNode's connected edges, disconnect,
         setFlavor/togglePort's dropped wires) makes React Flow synthesize
         these edge removals a tick after the applier armed the echo table —
         consume that expectation so the echo doesn't record back onto the
         wire. A genuine local Delete still records. */
      for (const ch of removes)
        if (!consumeEcho(ch.id)) record({ kind: 'disconnect', scope, id: strip(ch.id) });
    }
    onEdgesChange(changes);
  }, [onEdgesChange, strip, path]);

  /* a new connection: the fan-in / one-wire semantics live in the
     applier — here we just hand it the edge (compiled ids, the viewed
     level) */
  const onConnect = useCallback((c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle || !validConnection(c.sourceHandle, c.targetHandle)) return;
    dispatch({
      kind: 'connect', scope: { kind: 'doc', path: [] },
      edge: makeEdge(c.source, c.sourceHandle, c.target, c.targetHandle),
    });
  }, []);

  const isValid: IsValidConnection<BenchEdge> = useCallback(
    c => validConnection(c.sourceHandle, c.targetHandle), []);

  /* rebuild the whole bench (presets / paste) — release every device
     first (compiled ids, so module innards sweep too), then prune
     MIDI bindings that named a node this rebuild just replaced */
  const rebuild = useCallback((next: SubPatch) => {
    for (const n of mirror.nodes) releaseNode(n.id);
    rootRef.current = next;
    const flat2 = compile(next, libStore.resolve);
    mirror.nodes = flat2.nodes;
    mirror.edges = flat2.edges;
    viewKeyRef.current = { key: '' };
    setPath([]);
    const v = projectLevel(next, '', undefined, libStore.resolve);
    setNodes(v.nodes);
    setEdges(wires(v.edges));
    midi.pruneBindings();
  }, [setNodes, setEdges]);

  const level = useCallback(() => levelAt(rootRef.current, path, libStore.resolve), [path]);
  const root = useCallback(() => rootRef.current, []);
  const viewPath = useCallback(() => path.map(c => c.id), [path]);
  /* the library entry the viewed level IS — the last crumb's entry id, or
     null for a doc level. A remote entry op is "viewed" when this matches
     its scope, catching the case where the peer drilled into the entry
     through a DIFFERENT instance than the host who emitted the op. */
  const viewEntry = useCallback(() => path.at(-1)?.entry?.id ?? null, [path]);

  /* install the applier so every dispatch(op) — from any layer — lands
     here, choosing React Flow for the viewed level and an in-place tree
     write for the rest. Registered live so it always closes over the
     current path. */
  const apply = useOps({ root, viewPath, viewEntry, setNodes, setEdges, rebuild, bumpDoc });
  registerApplier(apply);

  return {
    nodes, edges, setNodes, setEdges, handleNodesChange, handleEdgesChange, onConnect, isValid,
    flat, path, prefix, strip, enter, enterLib, jump, goTo, level, root, rebuild,
  };
}

/* Split an entry level's write-back: the entry keeps the STRUCTURE (and
   its own stored values for nodes it already had); the owning instance
   takes the VALUES, wholesale. That is the by-reference contract —
   editing structure while drilled edits the shared definition, while a
   knob turn stays this instance's alone.

   `local` is the level as React Flow last held it, unprojected to the
   entry's own ids. */
function writeEntry(root: SubPatch, ctx: ViewCtx, local: SubPatch): void {
  const entry = ctx.level;

  /* the shelf-entered level has no owner: the view IS the definition, so
     structure AND values land on the entry wholesale — the on-screen
     knobs become the entry's defaults */
  if (!ctx.owner) {
    entry.nodes = local.nodes;
    entry.edges = local.edges;
    return;
  }
  const relPrefix = ctx.owner.relPrefix;

  /* structure → the entry. A node the entry already carries keeps its
     stored values, selection and nested-init (those are entry DEFAULTS,
     never overwritten by an instance's live view); everything else —
     position, name, ports, flavor, momentary, open, labels, ref — comes
     from the view. A node new to the entry lands whole, its current
     values becoming the entry's defaults. Deleted nodes simply vanish. */
  const prev = new Map(entry.nodes.map(n => [n.id, n]));
  entry.nodes = local.nodes.map(n => {
    const was = prev.get(n.id);
    return was
      ? { ...n, data: { ...n.data, slots: was.data.slots, sel: was.data.sel, vals: was.data.vals } }
      : n;
  });
  entry.edges = local.edges;

  /* values → the owning instance, wholesale, keyed by each node's path
     relative to the instance. Only the outermost instance in the user's
     tree exists as a real node; everything deeper is prototype-land. */
  /* the resolver matters here: a NESTED lib view's owner is a ref module
     inside an entry, reached through a lib-rooted docPath */
  const inst = levelAt(root, ctx.owner.docPath.map(id => ({ id, name: '' })), libStore.resolve)?.nodes
    .find(n => n.id === ctx.owner!.instId);
  if (!inst) return;
  const vals = (inst.data.vals ??= {});
  const live = new Set(local.nodes.map(n => n.id));
  for (const n of local.nodes) {
    if (n.type === 'module') continue;
    const key = relPrefix + n.id;
    const iv: InstVals = { slots: treeToSnap(n.data.slots), sel: n.data.sel };
    if (vals[key]?.media) iv.media = true;      // preserve the instance's media override
    vals[key] = iv;
  }
  /* prune vals for nodes that left this level: a key whose first segment
     past relPrefix names a node no longer present is dead — covering both
     a departed leaf and the whole subtree under a departed module. Keys
     for deeper levels of a surviving module are left alone (that module's
     own write-back owns them). */
  for (const key of Object.keys(vals)) {
    if (!key.startsWith(relPrefix)) continue;
    const seg = key.slice(relPrefix.length).split('/')[0];
    if (!live.has(seg)) delete vals[key];
  }
}
