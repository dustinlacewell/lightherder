/* The bench applier — how an op lands here, on this client.

   Every mutation reaches the bench as an op addressed by a COMPILED
   view id (the id the call site holds: "n5" at the root, "n2/n5" inside
   a module instance — the same ids React Flow, faces, sparks and MIDI
   all speak). This hook is the one place that knows which level is
   currently mounted in React Flow, so it is the one place that can
   choose the mechanism AND route the op to where it truly belongs now
   that a module is a reference, not a copy:

     · a VALUE crossing a ref boundary is instance-owned — it routes to
       the outermost instance's vals, in the doc scope, at a relative
       path. A knob turned deep inside instance A never moves B.

     · a STRUCTURE edit crossing a ref boundary edits the shared library
       ENTRY — every sibling instance moves together on the next compile.

     · nothing crossing a ref keeps the old doc-scope behavior, byte for
       byte: aliased in-place param writes, tree writes for unmounted
       levels, React Flow for the viewed one.

   The aliasing that used to carry an in-place param write to the engine
   no longer covers module innards (compile emits fresh data there). Its
   successor is the writeParam router below: after a canonical value op
   lands in vals, it also writes the live mirror node in place (engine,
   same tick) and the mounted React Flow node in place (so the next
   wholesale write-back carries the new value instead of erasing it). */

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  applyOp, applySlotOp, instancePrefixes, isSlotValueOp, isValueOp, libCrumbId, makeEdge, resolveCompiled, sweepEntryVals,
  type NodeData, type Op, type OpScope, type PatchEdge, type SubPatch,
} from '../../patch';
import { setDial, type Slot } from '@ldlework/dials';
import { dropEntryMedia, libStore } from '../../persist';
import { engineRef, expectEcho, mirror, releaseNode, type DispatchOpts } from '../../runtime';
import * as midi from '../../midi';
import { wire, type BenchEdge, type BenchNode } from './types';

export interface OpsDeps {
  /** the live root tree (bench.root) */
  root: () => SubPatch;
  /** the currently-viewed level, as its path of module-instance ids */
  viewPath: () => string[];
  /** the library entry the viewed level IS, or null for a doc level —
      the last crumb's entry id. A remote entry op is "viewed" when this
      matches its scope, whichever INSTANCE the peer drilled through. */
  viewEntry: () => string | null;
  setNodes: (fn: (ns: BenchNode[]) => BenchNode[]) => void;
  setEdges: (fn: (es: BenchEdge[]) => BenchEdge[]) => void;
  /** wholesale replacement (New / paste / preset) — the bench's rebuild */
  rebuild: (next: SubPatch) => void;
  /** bump the document version so the flat compile re-runs after an
      in-place structural write the viewed React state never saw */
  bumpDoc: () => void;
}

/* a param write rides the writeParam router — the engine reads the new
   value with no recompile — so it must stay render-free. Every other op
   changes the graph's shape (or, for markMedia, the compiled mediaKey);
   an in-place one leaves the memoized flat compile stale until the doc
   version bumps, so it counts as structural here even though its scope is
   the doc (its vals write lands on the owning instance, like a value). */
const isStructural = (op: Op): boolean => !isValueOp(op);

/** build the applier the dispatcher installs. It resolves a
    compiled-id op to its scoped, level-local canonical form, applies it
    on the right level by the right mechanism, and returns the canon. */
export function useOps(deps: OpsDeps): (op: Op, opts: DispatchOpts) => Op {
  const rf = useReactFlow();
  const { root, viewPath, viewEntry, setNodes, setEdges, rebuild, bumpDoc } = deps;

  return useCallback((op: Op, opts: DispatchOpts): Op => {
    /* the pre-canonicalize branches (setGlobal / replaceGraph / entry
       lifecycle) carry no drill scope to derive — their wire form IS the raw
       op — so they read above the canonicalize split. But that puts them
       ahead of the recordOnly guard, and a DEFERRED write-peer op (gate
       'defer' → applier recordOnly) would otherwise APPLY here, then apply
       AGAIN on the host echo: a duplicate same-id entry (a permanent fork),
       a doubled New. recordOnly means "don't apply locally, only shape the
       wire op"; for these the wire op is the op itself, so each returns it
       unapplied. Remote/canonical application never sets recordOnly, so it
       still lands; a no-session local dispatch never defers, so it is
       unaffected. */
    /* a global write always lands in the mirror; the res retune rides
       here (not the GlobalsBar) so a REMOTE res change retunes the engine
       too — the same net effect locally, correct remotely. */
    if (op.kind === 'setGlobal') {
      if (opts.recordOnly) return op;
      setDial(mirror.globals[op.k] as Slot<number>, op.v);
      if (op.k === 'res') engineRef.current?.setResolution(op.v);
      return op;
    }
    if (op.kind === 'replaceGraph') {
      if (opts.recordOnly) return op;
      /* paste carries the source patch's globals so the far side of the
         wire reproduces them; apply them (and retune the engine's
         resolution) BEFORE the rebuild, so the first compile paces itself
         by the pasted standard. New passes no globals — behaviour
         unchanged. */
      if (op.globals) {
        mirror.globals = op.globals;
        engineRef.current?.setResolution((op.globals.res as Slot<number>).dial.value);
      }
      rebuild(op.patch);
      return op;
    }
    /* library lifecycle ops carry no drill scope — they mutate the live
       library store directly, then touch it so the shelf, breadcrumbs
       and every ModuleNode re-derive and the debounced save fires.
       entryDelete additionally releases every instance's GPU/gesture/face
       state: the instances go orphan-dark on the next compile, but their
       rings would otherwise linger. */
    if (op.kind === 'entryDelete') {
      if (opts.recordOnly) return op;
      for (const p of instancePrefixes(root(), libStore.resolve, op.id))
        for (const n of mirror.nodes) if (n.id.startsWith(p)) releaseNode(n.id);
      /* drop the entry's stored media here (not at the call site) so a
         REMOTE entryDelete sheds it too, and a gated one sheds nothing.
         Instances keep their own override copies — only the entry's key
         space goes. */
      dropEntryMedia(op.id);
      applyOp(root(), mirror.globals, libStore.doc, op);
      bumpDoc();
      libStore.touch();
      return op;
    }
    if (op.kind === 'entryCreate' || op.kind === 'entryRename') {
      if (opts.recordOnly) return op;
      applyOp(root(), mirror.globals, libStore.doc, op);
      libStore.touch();
      return op;
    }

    /* a canonical op came off the session wire already scoped — skip
       canonicalize entirely and route from its own scope (the §C table).
       Remote application never returns a re-derived canon; it hands the
       op straight back (applyRemote's caller already holds the wire form). */
    if (opts.canonical) {
      applyCanonical(rf, { root, viewPath, viewEntry, setNodes, setEdges, bumpDoc }, op);
      return op;
    }

    const { canon, path } = canonicalize(root(), op);
    /* recordOnly: React Flow already applied this locally (a settled drag,
       a Delete-key removal). Return the canon WITHOUT applying — no RF
       call, no applyOp, no bump. Canonicalization alone routes the op to
       its true scope: a structural edit made while viewing a library entry
       carries an { entry } scope, not the { doc, path } the crumb ids
       would name. handleNodesChange has already run the viewed-level and
       sibling releases; here we only shape the wire op. */
    if (opts.recordOnly) return canon;
    /* a silent op (a MIDI CC) always writes the tree in place — never a
       render — even when it lands on the viewed level, so a relative
       encoder re-reads the value it just wrote and a burst never drops
       an increment. A viewed op the user made keeps the React path.

       Silence is safe ONLY for param writes: a silent STRUCTURAL op on
       the viewed level would change the tree behind React Flow's back,
       and the next genuine edit's write-back would unproject the stale
       RF list over it — erasing the change. Remote ops (the collab
       wire) must therefore route structural ops through the viewed
       mechanism whenever their level is mounted. */
    /* markMedia has no React Flow representation (the override is a vals
       flag, not a node field the view holds), so it ALWAYS lands in place
       — routing it through applyViewed would find nothing to write. It
       still bumps the doc (isStructural) so the recompile re-stamps the
       node's mediaKey and the engine reads the newly-stored blob. */
    const inPlace = opts.silent || op.kind === 'markMedia' || path.join('/') !== viewPath().join('/');
    if (!inPlace) {
      applyViewed(rf, setNodes, setEdges, op);
      syncMirrorViewed(op, canon.scope.kind === 'entry', bumpDoc);
    }
    else {
      applyOp(root(), mirror.globals, libStore.doc, canon);
      writeParam(rf, op, canon);
      if (isStructural(canon)) {
        bumpDoc();
        /* an entry-scoped structural edit reshaped a shared definition:
           persist the library and release the departed prototype in every
           sibling instance (the viewed one, if mounted, was already swept
           by React Flow / handleNodesChange) */
        if (canon.scope.kind === 'entry') {
          libStore.touch();
          if (canon.kind === 'removeNode') {
            for (const p of instancePrefixes(root(), libStore.resolve, canon.scope.id))
              releaseNode(p + canon.id);
            /* the node left the entry; its id is re-mintable, so sweep the
               stale vals every sibling instance still holds for it */
            sweepEntryVals(root(), libStore.resolve, canon.scope.id, canon.id);
          }
        }
      } else if (canon.scope.kind === 'entry') {
        /* an entry-scoped VALUE is a shared-default write (the entry's
           own node data, or a nested module's stored vals) — persist the
           library, and recompile so un-overridden instances re-merge it:
           values normally never bump, but no aliasing carries an entry
           default into the compiled instances (compile emits fresh data
           there). */
        libStore.touch();
        bumpDoc();
      }
      midi.fireModelWrite();
    }
    return canon;
  }, [rf, root, viewPath, viewEntry, setNodes, setEdges, rebuild, bumpDoc]);
}

/* ---- remote application: the §C per-kind routing --------------------- */

/* the deps applyCanonical closes over — the same view accessors the
   dispatched path uses, minus rebuild (replaceGraph short-circuits before
   this is reached) */
interface CanonDeps {
  root: () => SubPatch;
  viewPath: () => string[];
  viewEntry: () => string | null;
  setNodes: (fn: (ns: BenchNode[]) => BenchNode[]) => void;
  setEdges: (fn: (es: BenchEdge[]) => BenchEdge[]) => void;
  bumpDoc: () => void;
}

/* land a remote op that came off the wire already scoped. The op names
   WHERE it belongs (an OpScope); this decides viewed-vs-unviewed against
   the peer's current drill and reconstructs the compiled ids the viewed
   mechanisms speak, exactly the §C table:

     · a viewed level routes through applyViewed / writeParam, so the next
       wholesale write-back carries the change instead of erasing it.
     · an unviewed level takes applyOp in place + bumpDoc, plus the
       cross-layer releases the pure document can't reach.

   markMedia is forced in place (no RF representation); a doc-scope value
   with no rel keeps the aliased in-place write, no bump. Rings stay warm
   — the only recompile is bumpDoc; compiled ids are stable. */
function applyCanonical(
  rf: ReturnType<typeof useReactFlow>,
  deps: CanonDeps,
  op: Exclude<Op, { kind: 'setGlobal' | 'replaceGraph' | 'entryCreate' | 'entryRename' | 'entryDelete' }>,
): void {
  const { root, viewPath, viewEntry, setNodes, setEdges, bumpDoc } = deps;
  const scope = op.scope;
  /* the viewed level's compiled prefix — the ids React Flow, faces, sparks
     all hold. For a doc op it is the scope's own path (only when viewed);
     for an entry op it is the peer's drill prefix, whichever instance chain
     reaches the shared entry. */
  const viewPrefix = prefixOf(viewPath());
  const viewed = scope.kind === 'doc'
    ? scope.path.join('/') === viewPath().join('/')
    : viewEntry() === scope.id;

  /* the §C value rows, split by rel:
       · no rel — viewed: applyViewed (an RF render, the knob is theirs to
         watch); unviewed: applyOp in place, the aliased mirror feels it.
       · with rel — always applyOp (vals) + writeParam, never an RF render:
         the value lives in the instance's vals, not a node field the view
         holds, so writeParam patches the mirror (+ RF node when mounted).
     markMedia has no RF node either — always in place. */
  const isValue = isValueOp(op);
  /* an entry-scoped rel-less value is a shared-DEFAULT write. It lands
     through React Flow only when this tab stands inside that very entry
     from the shelf (the RF nodes ARE the defaults). Drilled through an
     instance, the view shows instance-merged values — routing it to RF
     would launder the default into an instance override on the next
     write-back — so it must land in place. */
  const vp = viewPath();
  const libViewed = scope.kind === 'entry' && vp.length === 1 && vp[0] === libCrumbId(scope.id);
  const inPlace = !viewed || op.kind === 'markMedia'
    || ((isSlotValueOp(op) || op.kind === 'setSel') && op.rel !== undefined)
    || (isValue && scope.kind === 'entry' && !libViewed);

  if (!inPlace) {
    const viewedOp = compileIds(op, viewPrefix);
    /* a viewed structural op lands through React Flow, which reports its
       removals back ASYNCHRONOUSLY (deleteElements is awaited; setEdges
       rides a batch whose diff synthesizes 'remove' changes) — arm the
       echo table with the exact compiled ids RF will deliver, so the later
       handleNodesChange/handleEdgesChange record is suppressed instead of
       bouncing this op back onto the wire. */
    armEcho(rf, viewedOp);
    applyViewed(rf, setNodes, setEdges, viewedOp);
    syncMirrorViewed(viewedOp, scope.kind === 'entry', bumpDoc);
    return;
  }

  /* in place: mutate the scoped level of the tree, mirror-write a
     ref-boundary value so the engine feels it now, then the structural
     recompile + cross-layer releases the pure applyOp couldn't do. */
  const effect = applyOp(root(), mirror.globals, libStore.doc, op);
  writeParamRemote(rf, op, scope, viewPrefix);
  if (op.kind === 'setParam' || op.kind === 'setSel') {
    if (scope.kind === 'entry') {
      /* a shared-default write: persist the library and recompile so
         un-overridden instances re-merge it (no aliasing reaches the
         compiled instances' fresh data) */
      libStore.touch();
      bumpDoc();
    }
    midi.fireModelWrite();   // parity with the local silent branch's persist
    return;                  // values never bump (entry defaults excepted above)
  }

  bumpDoc();
  if (scope.kind === 'entry') {
    libStore.touch();
    if (op.kind === 'removeNode') {
      /* the prototype left the shared entry: release its ring in every
         sibling instance, and sweep the stale vals they still hold for
         its now-re-mintable id */
      for (const p of instancePrefixes(root(), libStore.resolve, scope.id))
        releaseNode(p + op.id);
      sweepEntryVals(root(), libStore.resolve, scope.id, op.id);
    }
  } else if (effect.removed.length) {
    /* the doc in-place removeNode fix: applyOp reports the departed ids,
       so release each at its compiled address (scope prefix + local id) —
       the ring the pure document couldn't reach */
    const pfx = prefixOf(scope.path);
    for (const rid of effect.removed) releaseNode(pfx + rid);
  }
  /* the same debounced persist/refresh the local silent branch fires after
     an in-place structural write — the model changed behind React's back */
  midi.fireModelWrite();
}

/* arm the echo table for a VIEWED structural op before applyViewed runs.
   Every id enumerated here is one React Flow will report back as a removal
   a microtask (or a commit) later — through handleNodesChange /
   handleEdgesChange — where it would otherwise record() the op straight
   back onto the wire. We enumerate exactly what RF will drop, using the
   SAME predicates RF's own removal path uses (verified against xyflow's
   getConnectedEdges: source|target match), so the ids are the identical
   strings the change events will carry:

     · removeNode → the node's compiled id, PLUS every edge touching it
       (deleteElements deletes connected edges: source === id || target === id).
     · setFlavor  → every edge on the node (applyViewed drops source|target === node).
     · togglePort (off) → the control edges landing on the un-exposed port.

   disconnect is deliberately NOT armed: its applyViewed branch drops the
   edge through the deps `setEdges` STATE setter, not the `rf.setEdges`
   helper — a plain React state update that synthesizes no onEdgesChange, so
   no handleEdgesChange record ever fires to consume the arm. Arming it would
   leave a stale echo id (a deterministic makeEdge id) parked for the 2s TTL,
   and if the same wire were redrawn then genuinely deleted within that
   window the lingering arm would swallow the real record. setFlavor and
   togglePort use the rf helper and DO echo, so they stay armed. */
function armEcho(
  rf: ReturnType<typeof useReactFlow>,
  op: Exclude<Op, { kind: 'setGlobal' | 'replaceGraph' | 'entryCreate' | 'entryRename' | 'entryDelete' }>,
): void {
  const edges = rf.getEdges();
  switch (op.kind) {
    case 'removeNode': {
      const ids = [op.id];
      for (const e of edges) if (e.source === op.id || e.target === op.id) ids.push(e.id);
      expectEcho(ids);
      return;
    }
    case 'setFlavor': {
      const ids: string[] = [];
      for (const e of edges) if (e.source === op.node || e.target === op.node) ids.push(e.id);
      if (ids.length) expectEcho(ids);
      return;
    }
    case 'togglePort': {
      if (op.on) return;   // adding a port drops no wires
      const handle = `c:${op.param}`;
      const ids: string[] = [];
      for (const e of edges) if (e.target === op.node && e.targetHandle === handle) ids.push(e.id);
      if (ids.length) expectEcho(ids);
      return;
    }
    default:
      return;   // no removal echo (addNode, connect, rename, setProp, moveNode)
  }
}

/* rebuild the compiled-id form of a scoped op for the viewed mechanisms
   (applyViewed holds compiled ids). The scope's prefix — a doc op's own
   path, or the peer's drill prefix for an entry op (both equal to the
   viewed prefix, since we only reach here when viewed) — re-embeds into
   every id, and connect's edge id is rebuilt from its compiled ends. */
function compileIds(
  op: Exclude<Op, { kind: 'setGlobal' | 'replaceGraph' | 'entryCreate' | 'entryRename' | 'entryDelete' }>,
  prefix: string,
): Exclude<Op, { kind: 'setGlobal' | 'replaceGraph' | 'entryCreate' | 'entryRename' | 'entryDelete' }> {
  switch (op.kind) {
    case 'setParam': case 'setSel': case 'slotAttach': case 'slotDepth': case 'slotMode':
      /* a viewed value with rel addresses the node inside the instance —
         the compiled id is prefix + node + '/' + rel */
      return { ...op, node: op.rel !== undefined ? prefix + op.node + '/' + op.rel : prefix + op.node };
    case 'markMedia':
      return { ...op, node: prefix + op.node + '/' + op.rel };
    case 'addNode':
      return { ...op, node: { ...op.node, id: prefix + op.node.id } };
    case 'removeNode': case 'disconnect':
      return { ...op, id: prefix + op.id };
    case 'connect': {
      const source = prefix + op.edge.source, target = prefix + op.edge.target;
      return { ...op, edge: { ...op.edge, source, target, id: makeEdge(source, op.edge.sourceHandle, target, op.edge.targetHandle).id } };
    }
    default:
      /* rename / setFlavor / setProp / togglePort / moveNode */
      return { ...op, node: prefix + op.node };
  }
}

/* the writeParam router for a remote value: a ref-boundary value (rel set)
   landed in the instance's vals, so the fresh compiled mirror never saw
   it — write it into the mirror node (engine, same tick) and, if the level
   is mounted, the React Flow node (so the next write-back carries it). The
   compiled id is the scope prefix + node + '/' + rel. Values without rel
   already rode applyOp's aliased in-place write. */
function writeParamRemote(
  rf: ReturnType<typeof useReactFlow>,
  op: Op,
  scope: OpScope,
  viewPrefix: string,
): void {
  if (!(isSlotValueOp(op) || op.kind === 'setSel') || op.rel === undefined) return;
  /* an entry value's mirror id uses the drill prefix; a doc value's uses
     its scope path. When unviewed the RF node is simply absent — the
     mirror write alone carries the engine. */
  const prefix = scope.kind === 'doc' ? prefixOf(scope.path) : viewPrefix;
  const compiledId = prefix + op.node + '/' + op.rel;
  const put = (d: NodeData): void => {
    if (op.kind === 'setSel') d.sel = op.i;
    else if (isSlotValueOp(op)) applySlotOp(d.slots, op);
  };
  const m = mirror.nodes.find(n => n.id === compiledId);
  if (m) put(m.data);
  const rn = rf.getNode(compiledId);
  if (rn) put(rn.data as NodeData);
}

/* ---- the viewed-branch mirror sync ------------------------------------ */

/* The flat compile is keyed on the doc version — never on React Flow
   state identity (a recompile re-clones every module instance's slot
   tree, resetting each attached source's state, so render noise must
   never trigger one). An op applyViewed just landed through React Flow
   therefore reaches the engine explicitly, by op class:

     · a VALUE op patches the compiled mirror node in place — the same
       write the silent/unmounted path makes. At the root the mirror
       shares the view's slot objects and the re-apply is idempotent;
       under a ref (a drilled level, a shelf solo) the mirror holds its
       own clone and this write IS what the engine feels. No recompile.

     · a data-FIELD op (setProp, rename, moveNode) patches the mirror
       node in place too — recompiling for a drawer toggle or a rename
       would reset module modulation for nothing. An entry-scoped one
       edits a SHARED definition whose sibling instances must remerge,
       so that one recompiles.

     · a STRUCTURAL op reshaped the graph — bump the doc version; the
       render-time write-back lands the RF state in the tree before the
       memoized compile re-runs. RF's ASYNC removals (deleteElements,
       the setEdges batch) additionally bump from handleNodesChange /
       handleEdgesChange when they settle, so the mirror catches up even
       though this bump ran before RF applied them. */
function syncMirrorViewed(
  op: Exclude<Op, { kind: 'setGlobal' | 'replaceGraph' | 'entryCreate' | 'entryRename' | 'entryDelete' }>,
  entryScoped: boolean,
  bumpDoc: () => void,
): void {
  if (isSlotValueOp(op) || op.kind === 'setSel') {
    const m = mirror.nodes.find(n => n.id === op.node);
    if (!m) return;
    if (op.kind === 'setSel') m.data.sel = op.i;
    else applySlotOp(m.data.slots, op);
    return;
  }
  if (!entryScoped && (op.kind === 'setProp' || op.kind === 'rename' || op.kind === 'moveNode')) {
    const m = mirror.nodes.find(n => n.id === op.node);
    if (!m) return;
    if (op.kind === 'setProp') m.data[op.key] = op.v;
    else if (op.kind === 'rename') m.data.name = op.name;
    else m.position = { x: op.x, y: op.y };
    return;
  }
  bumpDoc();
}

/* ---- the writeParam router (the aliasing's successor) ----------------- */

/* a canonical value op crossing a ref carries `rel` — it landed in the
   instance's vals, not a shared node, so the compiled mirror (fresh data
   under a ref) never saw it. Write it into the mirror in place so the
   engine feels it this very tick, and into the mounted React Flow node
   (present only when this level is viewed) so the next wholesale
   write-back carries the value rather than erasing it. Ops without `rel`
   still ride the old aliasing (applyOp mutated the shared object). */
function writeParam(
  rf: ReturnType<typeof useReactFlow>,
  op: Op,
  canon: Op,
): void {
  /* rel-less writes ride the old aliasing — EXCEPT an entry-scoped one
     (a shelf-view default): the entry's compiled nodes are emitted
     fresh (solo compile merges under a ref like any instance), so no
     aliasing reaches the mirror — this write is what the engine feels
     same-tick, and the RF write keeps a mounted lib view honest */
  if (!(isSlotValueOp(canon) || canon.kind === 'setSel')
    || (canon.rel === undefined && canon.scope.kind !== 'entry')) return;
  const compiledId = isSlotValueOp(op) || op.kind === 'setSel' ? op.node : '';
  const put = (d: NodeData): void => {
    if (canon.kind === 'setSel') d.sel = canon.i;
    else if (isSlotValueOp(canon)) applySlotOp(d.slots, canon);
  };
  const m = mirror.nodes.find(n => n.id === compiledId);
  if (m) put(m.data);
  const rn = rf.getNode(compiledId);
  if (rn) put(rn.data as NodeData);
}

/* ---- canonicalization: compiled ids → scoped, level-local ------------- */

const prefixOf = (path: string[]): string => (path.length ? path.join('/') + '/' : '');
const stripper = (prefix: string) => (id: string) => (prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id);

/** the compiled drill prefix of a node id — every segment before the
    last. This decides the inPlace test: a level's compiled prefix is its
    drill prefix regardless of any ref boundary inside it, so the mounted-
    level comparison is unchanged by references. */
function compiledPrefix(compiledId: string): string[] {
  return compiledId.split('/').slice(0, -1);
}

/* an op arrives addressing its node/edge by compiled id; the canonical
   op the wire carries names the scope explicitly. A ref boundary on the
   way to the node splits the routing: a VALUE lands in the doc scope on
   the outermost instance (with a relative path); a STRUCTURE edit lands
   in the entry scope, on the entry-local id. Nothing crossing a ref
   keeps the old doc-scope, prefix-stripped behavior byte for byte. */
function canonicalize(root: SubPatch, op: Exclude<Op, { kind: 'setGlobal' | 'replaceGraph' | 'entryCreate' | 'entryRename' | 'entryDelete' }>): { canon: Extract<Op, { scope: OpScope }>; path: string[] } {
  const resolve = libStore.resolve;
  switch (op.kind) {
    /* values: route to the instance's vals when a ref is crossed */
    case 'setParam': case 'setSel': case 'markMedia': {
      const r = resolveCompiled(root, resolve, op.node);
      const path = compiledPrefix(op.node);
      /* a lib-rooted id: the view stands inside the entry itself, so a
         value IS a default — the entry's own node data (no ref crossed
         on the walk), or a nested ref module's stored default vals
         (rel). Entry scope either way; applyOp's entry level already
         applies both shapes. */
      if (r.lib !== undefined) {
        const scope: OpScope = { kind: 'entry', id: r.lib };
        return r.inst !== null
          ? { canon: { ...op, scope, node: r.inst, rel: r.rel }, path }
          : { canon: { ...op, scope, node: r.local }, path };
      }
      if (r.inst !== null) {
        const scope: OpScope = { kind: 'doc', path: r.docPath };
        return { canon: { ...op, scope, node: r.inst, rel: r.rel }, path };
      }
      /* markMedia only exists across a ref; without one, treat like the
         plain doc-scope value write (it never fires there today) */
      const { local } = splitId(op.node);
      return { canon: { ...op, scope: { kind: 'doc', path }, node: local }, path };
    }
    /* structure: route to the entry when a ref is crossed */
    case 'addNode': {
      const r = resolveCompiled(root, resolve, op.node.id);
      const path = compiledPrefix(op.node.id);
      const scope: OpScope = entryScoped(r) ? { kind: 'entry', id: r.entryId! } : { kind: 'doc', path };
      return { canon: { ...op, scope, node: { ...op.node, id: r.local } }, path };
    }
    case 'removeNode': {
      const r = resolveCompiled(root, resolve, op.id);
      const path = compiledPrefix(op.id);
      const scope: OpScope = entryScoped(r) ? { kind: 'entry', id: r.entryId! } : { kind: 'doc', path };
      return { canon: { ...op, scope, id: r.local }, path };
    }
    case 'connect': {
      /* wires never cross a boundary — either end decides the level */
      const r = resolveCompiled(root, resolve, op.edge.source);
      const path = compiledPrefix(op.edge.source);
      const strip = stripper(prefixOf(path));
      /* makeEdge's id embeds its endpoint ids, so stripping only the
         leading prefix would leave compiled ids buried inside it —
         rebuild the id from the localized ends, the exact string a wire
         drawn locally at this level would carry */
      const source = strip(op.edge.source), target = strip(op.edge.target);
      const edge: PatchEdge = { ...op.edge, source, target, id: makeEdge(source, op.edge.sourceHandle, target, op.edge.targetHandle).id };
      const scope: OpScope = entryScoped(r) ? { kind: 'entry', id: r.entryId! } : { kind: 'doc', path };
      return { canon: { ...op, scope, edge }, path };
    }
    case 'disconnect':
      /* an edge id is not a simple compiled node id — a disconnect
         carries its scope and a level-local edge id already */
      return { canon: op, path: op.scope.kind === 'doc' ? op.scope.path : [] };
    default: {
      /* rename / setFlavor / setProp / togglePort / moveNode */
      const r = resolveCompiled(root, resolve, op.node);
      const path = compiledPrefix(op.node);
      const scope: OpScope = entryScoped(r) ? { kind: 'entry', id: r.entryId! } : { kind: 'doc', path };
      return { canon: { ...op, scope, node: r.local }, path };
    }
  }
}

/* structure routes to the entry when a ref was crossed — including a
   lib-rooted id, where the walk STARTS inside an entry and crosses no
   instance at depth one */
function entryScoped(r: { inst: string | null; lib?: string }): boolean {
  return r.inst !== null || r.lib !== undefined;
}

/** split a compiled node id into its scope (module-instance chain) and
    the level-local id — "n2/n5" → (["n2"], "n5"), "n5" → ([], "n5") */
function splitId(compiled: string): { path: string[]; local: string } {
  const parts = compiled.split('/');
  return { path: parts.slice(0, -1), local: parts[parts.length - 1] };
}

/* ---- the viewed-level mechanisms (behavior-preserving) ---------------- */

/* on the mounted level every op routes to the exact React Flow call the
   old scattered site made, so the render-time write-back is unchanged.
   Ids stay compiled here — that's what React Flow holds. */
function applyViewed(
  rf: ReturnType<typeof useReactFlow>,
  setNodes: (fn: (ns: BenchNode[]) => BenchNode[]) => void,
  setEdges: (fn: (es: BenchEdge[]) => BenchEdge[]) => void,
  op: Exclude<Op, { kind: 'setGlobal' | 'replaceGraph' | 'entryCreate' | 'entryRename' | 'entryDelete' }>,
): void {
  switch (op.kind) {
    case 'setParam': case 'slotAttach': case 'slotDepth': case 'slotMode':
      rf.updateNodeData(op.node, n => { applySlotOp((n.data as NodeData).slots, op); return {}; });
      return;
    case 'setSel':
      rf.updateNodeData(op.node, { sel: op.i });
      return;
    case 'markMedia':
      /* unreachable: markMedia always routes in-place (it has no RF
         representation — the override is a vals flag). The applier forces
         inPlace before ever reaching applyViewed. */
      return;
    case 'rename':
      rf.updateNodeData(op.node, { name: op.name });
      return;
    case 'setProp':
      rf.updateNodeData(op.node, { [op.key]: op.v });
      return;
    case 'setFlavor':
      rf.setEdges(es => es.filter(e => e.source !== op.node && e.target !== op.node));
      rf.updateNodeData(op.node, { flavor: op.flavor });
      return;
    case 'togglePort':
      /* removing a port drops its wires — they'd have nowhere to land */
      if (!op.on) rf.setEdges(es => es.filter(e => !(e.target === op.node && e.targetHandle === `c:${op.param}`)));
      rf.updateNodeData(op.node, n => {
        const cur = (n.data as NodeData).ports ?? [];
        return { ports: op.on ? [...cur, op.param] : cur.filter(x => x !== op.param) };
      });
      return;
    case 'moveNode':
      rf.updateNode(op.node, { position: { x: op.x, y: op.y } });
      return;
    case 'addNode':
      setNodes(ns => [...ns, op.node as BenchNode]);
      return;
    case 'removeNode':
      releaseNode(op.id);
      rf.deleteElements({ nodes: [{ id: op.id }] });
      return;
    case 'connect':
      setEdges(es => [
        ...es.filter(e =>
          !(e.source === op.edge.source && e.sourceHandle === op.edge.sourceHandle && e.target === op.edge.target && e.targetHandle === op.edge.targetHandle)
          && (op.edge.targetHandle?.startsWith('c:') || !(e.target === op.edge.target && e.targetHandle === op.edge.targetHandle))),
        wire(op.edge),
      ]);
      return;
    case 'disconnect':
      setEdges(es => es.filter(e => e.id !== op.id));
      return;
  }
}
